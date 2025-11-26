class API {
    constructor() {
        this.baseUrl = '';
        this.token = localStorage.getItem('natabridge_token');
    }

    setToken(token) {
        this.token = token;
        if (token) {
            localStorage.setItem('natabridge_token', token);
        } else {
            localStorage.removeItem('natabridge_token');
        }
    }

    getHeaders() {
        const headers = {
            'Content-Type': 'application/json'
        };
        if (this.token) {
            headers['Authorization'] = `Bearer ${this.token}`;
        }
        return headers;
    }

    async request(method, endpoint, data = null) {
        const options = {
            method,
            headers: this.getHeaders()
        };

        if (data && (method === 'POST' || method === 'PUT')) {
            options.body = JSON.stringify(data);
        }

        try {
            const response = await fetch(`${this.baseUrl}${endpoint}`, options);
            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error || 'Request failed');
            }

            return result;
        } catch (error) {
            if (!navigator.onLine) {
                throw new Error('You are offline. Data will be synced when connection is restored.');
            }
            throw error;
        }
    }

    async register(userData) {
        const result = await this.request('POST', '/api/auth/register', userData);
        if (result.token) {
            this.setToken(result.token);
            await localDB.saveUser(result.user);
        }
        return result;
    }

    async login(credentials) {
        const result = await this.request('POST', '/api/auth/login', credentials);
        if (result.token) {
            this.setToken(result.token);
            await localDB.saveUser(result.user);
        }
        return result;
    }

    async logout() {
        this.setToken(null);
        await localDB.clearUser();
    }

    async getCurrentUser() {
        if (!navigator.onLine) {
            return await localDB.getUser();
        }
        
        try {
            const user = await this.request('GET', '/api/auth/me');
            await localDB.saveUser(user);
            return user;
        } catch (error) {
            return await localDB.getUser();
        }
    }

    async registerMother(motherData) {
        if (!navigator.onLine) {
            const id = await localDB.add(STORES.MOTHERS, motherData);
            await localDB.addToSyncQueue('mothers', 'create', { ...motherData, id });
            return { id, offline: true, message: 'Saved offline. Will sync when online.' };
        }
        
        const result = await this.request('POST', '/api/mothers', motherData);
        await localDB.put(STORES.MOTHERS, { ...motherData, id: result.id, synced: true });
        return result;
    }

    async getMothers() {
        if (!navigator.onLine) {
            return await localDB.getAll(STORES.MOTHERS);
        }
        
        try {
            const mothers = await this.request('GET', '/api/mothers');
            for (const mother of mothers) {
                await localDB.put(STORES.MOTHERS, { ...mother, synced: true });
            }
            return mothers;
        } catch (error) {
            return await localDB.getAll(STORES.MOTHERS);
        }
    }

    async getMother(id) {
        if (!navigator.onLine) {
            return await localDB.get(STORES.MOTHERS, id);
        }
        
        try {
            const mother = await this.request('GET', `/api/mothers/${id}`);
            await localDB.put(STORES.MOTHERS, { ...mother, synced: true });
            return mother;
        } catch (error) {
            return await localDB.get(STORES.MOTHERS, id);
        }
    }

    async updateMother(id, motherData) {
        if (!navigator.onLine) {
            const existing = await localDB.get(STORES.MOTHERS, id);
            const updated = { ...existing, ...motherData, synced: false };
            await localDB.put(STORES.MOTHERS, updated);
            await localDB.addToSyncQueue('mothers', 'update', updated);
            return { offline: true, message: 'Update saved offline.' };
        }
        
        return await this.request('PUT', `/api/mothers/${id}`, motherData);
    }

    async createTriage(triageData) {
        if (!navigator.onLine) {
            const id = await localDB.add(STORES.TRIAGE, triageData);
            await localDB.addToSyncQueue('triage', 'create', { ...triageData, id });
            
            const riskScore = this.calculateRiskScoreLocal(triageData);
            return { 
                id, 
                offline: true, 
                risk_score: riskScore,
                message: 'Triage saved offline.' 
            };
        }
        
        return await this.request('POST', '/api/triage', triageData);
    }

    calculateRiskScoreLocal(data) {
        let score = 0;
        const factors = [];
        const symptoms = data.symptoms || [];

        const dangerSigns = {
            'severe_headache': 15,
            'blurred_vision': 15,
            'convulsions': 25,
            'severe_abdominal_pain': 20,
            'vaginal_bleeding': 25,
            'fever': 10,
            'reduced_fetal_movement': 20,
            'swelling_face_hands': 10,
            'difficulty_breathing': 20,
            'chest_pain': 15,
            'severe_vomiting': 10,
            'water_breaking_early': 25
        };

        for (const symptom of symptoms) {
            if (dangerSigns[symptom]) {
                score += dangerSigns[symptom];
                factors.push(symptom.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()));
            }
        }

        if (data.bp_systolic) {
            if (data.bp_systolic >= 160 || data.bp_diastolic >= 110) {
                score += 25;
                factors.push('Severe Hypertension');
            } else if (data.bp_systolic >= 140 || data.bp_diastolic >= 90) {
                score += 15;
                factors.push('Hypertension');
            }
        }

        if (data.heart_rate && (data.heart_rate > 120 || data.heart_rate < 60)) {
            score += 10;
            factors.push('Abnormal Heart Rate');
        }

        if (data.temperature && data.temperature >= 38.5) {
            score += 15;
            factors.push('High Fever');
        }

        if (data.spo2 && data.spo2 < 90) {
            score += 25;
            factors.push('Critical Oxygen Level');
        } else if (data.spo2 && data.spo2 < 95) {
            score += 10;
            factors.push('Low Oxygen Level');
        }

        let level;
        if (score >= 50) level = 'emergency';
        else if (score >= 30) level = 'high_risk';
        else if (score >= 15) level = 'caution';
        else level = 'normal';

        return { score, level, factors };
    }

    async getTriageHistory(motherId) {
        if (!navigator.onLine) {
            return await localDB.getByIndex(STORES.TRIAGE, 'mother_id', motherId);
        }
        return await this.request('GET', `/api/triage/history/${motherId}`);
    }

    async getCHWAssignments() {
        return await this.request('GET', '/api/chw/assignments');
    }

    async createVisit(visitData) {
        if (!navigator.onLine) {
            const id = await localDB.add(STORES.VISITS, visitData);
            await localDB.addToSyncQueue('home_visits', 'create', { ...visitData, id });
            return { id, offline: true, message: 'Visit saved offline.' };
        }
        
        return await this.request('POST', '/api/chw/visits', visitData);
    }

    async getVisits(motherId) {
        if (!navigator.onLine) {
            return await localDB.getByIndex(STORES.VISITS, 'mother_id', motherId);
        }
        return await this.request('GET', `/api/chw/visits/${motherId}`);
    }

    async createEmergencyAlert(alertData) {
        if (!navigator.onLine) {
            await localDB.addToSyncQueue('emergency_alerts', 'create', alertData);
            return { offline: true, message: 'Emergency alert queued for sending.' };
        }
        
        return await this.request('POST', '/api/emergency/alert', alertData);
    }

    async getEmergencyAlerts() {
        return await this.request('GET', '/api/emergency/alerts');
    }

    async updateEmergencyAlert(alertId, data) {
        return await this.request('PUT', `/api/emergency/alerts/${alertId}`, data);
    }

    async createReferral(referralData) {
        return await this.request('POST', '/api/referral', referralData);
    }

    async getTransportContacts() {
        if (!navigator.onLine) {
            return await localDB.getTransportContacts();
        }
        
        try {
            const contacts = await this.request('GET', '/api/transport-contacts');
            await localDB.cacheTransportContacts(contacts);
            return contacts;
        } catch (error) {
            return await localDB.getTransportContacts();
        }
    }

    async getEducationModules(language = 'english', category = null) {
        if (!navigator.onLine) {
            return await localDB.getEducationModules(language, category);
        }
        
        try {
            let endpoint = `/api/education/modules?language=${language}`;
            if (category) endpoint += `&category=${category}`;
            
            const modules = await this.request('GET', endpoint);
            await localDB.cacheEducationModules(modules);
            return modules;
        } catch (error) {
            return await localDB.getEducationModules(language, category);
        }
    }

    async getEducationCategories() {
        return await this.request('GET', '/api/education/categories');
    }

    async recordNataBandVitals(vitalsData) {
        return await this.request('POST', '/api/nataband/vitals', vitalsData);
    }

    async getNataBandReadings(motherId) {
        return await this.request('GET', `/api/nataband/readings/${motherId}`);
    }

    async getDashboardStats() {
        return await this.request('GET', '/api/dashboard/stats');
    }

    async getHighRiskMothers() {
        return await this.request('GET', '/api/dashboard/high-risk');
    }

    async getNotifications() {
        if (!navigator.onLine) {
            return await localDB.getAll(STORES.NOTIFICATIONS);
        }
        
        try {
            const notifications = await this.request('GET', '/api/notifications');
            return notifications;
        } catch (error) {
            return await localDB.getAll(STORES.NOTIFICATIONS);
        }
    }

    async markNotificationRead(notificationId) {
        return await this.request('PUT', `/api/notifications/${notificationId}/read`);
    }

    async syncOfflineData() {
        if (!navigator.onLine) return { success: false, message: 'Still offline' };

        const queue = await localDB.getSyncQueue();
        const results = { success: [], failed: [] };

        for (const item of queue) {
            try {
                let endpoint, method;
                
                switch (item.table) {
                    case 'mothers':
                        endpoint = '/api/mothers';
                        method = item.action === 'create' ? 'POST' : 'PUT';
                        if (item.action === 'update') endpoint += `/${item.data.id}`;
                        break;
                    case 'home_visits':
                        endpoint = '/api/chw/visits';
                        method = 'POST';
                        break;
                    case 'triage':
                        endpoint = '/api/triage';
                        method = 'POST';
                        break;
                    case 'emergency_alerts':
                        endpoint = '/api/emergency/alert';
                        method = 'POST';
                        break;
                    default:
                        continue;
                }

                const result = await this.request(method, endpoint, item.data);
                results.success.push({ local_id: item.local_id, server_id: result.id });
                
                if (item.table === 'mothers' && item.data.id) {
                    await localDB.markSynced(STORES.MOTHERS, item.data.id);
                }
            } catch (error) {
                results.failed.push({ local_id: item.local_id, error: error.message });
            }
        }

        if (results.failed.length === 0) {
            await localDB.clearSyncQueue();
        }

        return results;
    }

    async syncPull(lastSync = null) {
        if (!navigator.onLine) return null;
        
        let endpoint = '/api/sync/pull';
        if (lastSync) endpoint += `?last_sync=${lastSync}`;
        
        const result = await this.request('GET', endpoint);
        
        if (result.data) {
            if (result.data.mothers) {
                for (const mother of result.data.mothers) {
                    await localDB.put(STORES.MOTHERS, { ...mother, synced: true });
                }
            }
            
            if (result.data.education_modules) {
                await localDB.cacheEducationModules(result.data.education_modules);
            }
            
            if (result.data.transport_contacts) {
                await localDB.cacheTransportContacts(result.data.transport_contacts);
            }
        }
        
        return result;
    }
}

const api = new API();
window.api = api;
