class NataBridgeApp {
    constructor() {
        this.currentPage = 'login';
        this.user = null;
        this.isOnline = navigator.onLine;
        this.init();
    }

    async init() {
        await localDB.init();
        
        this.setupEventListeners();
        this.setupOnlineStatus();
        this.registerServiceWorker();
        
        const token = localStorage.getItem('natabridge_token');
        if (token) {
            try {
                this.user = await api.getCurrentUser();
                if (this.user) {
                    this.showApp();
                    this.navigateTo('dashboard');
                    await this.syncData();
                } else {
                    this.showAuth();
                }
            } catch (error) {
                this.showAuth();
            }
        } else {
            this.showAuth();
        }
    }

    async registerServiceWorker() {
        if ('serviceWorker' in navigator) {
            try {
                const registration = await navigator.serviceWorker.register('/sw.js');
                console.log('Service Worker registered:', registration.scope);
                
                navigator.serviceWorker.addEventListener('message', (event) => {
                    if (event.data.type === 'SYNC_COMPLETED') {
                        this.showToast('Data synchronized successfully!', 'success');
                    }
                });
            } catch (error) {
                console.error('Service Worker registration failed:', error);
            }
        }
    }

    setupOnlineStatus() {
        const updateOnlineStatus = () => {
            this.isOnline = navigator.onLine;
            const indicator = document.getElementById('offline-indicator');
            if (indicator) {
                indicator.classList.toggle('show', !this.isOnline);
            }
            
            if (this.isOnline) {
                this.syncData();
            }
        };

        window.addEventListener('online', updateOnlineStatus);
        window.addEventListener('offline', updateOnlineStatus);
        updateOnlineStatus();
    }

    async syncData() {
        if (!this.isOnline || !this.user) return;
        
        try {
            const results = await api.syncOfflineData();
            if (results.success && results.success.length > 0) {
                this.showToast(`Synced ${results.success.length} items`, 'success');
            }
            
            const lastSync = localStorage.getItem('last_sync');
            const pullResult = await api.syncPull(lastSync);
            if (pullResult) {
                localStorage.setItem('last_sync', pullResult.sync_time);
            }
        } catch (error) {
            console.error('Sync failed:', error);
        }
    }

    setupEventListeners() {
        document.addEventListener('click', (e) => {
            const navItem = e.target.closest('.nav-item');
            if (navItem) {
                const page = navItem.dataset.page;
                if (page) this.navigateTo(page);
            }
        });

        document.getElementById('login-form')?.addEventListener('submit', (e) => this.handleLogin(e));
        document.getElementById('register-form')?.addEventListener('submit', (e) => this.handleRegister(e));
    }

    showAuth() {
        document.getElementById('auth-container').style.display = 'flex';
        document.getElementById('app-container').style.display = 'none';
        this.showPage('login');
    }

    showApp() {
        document.getElementById('auth-container').style.display = 'none';
        document.getElementById('app-container').style.display = 'flex';
        this.updateHeader();
    }

    updateHeader() {
        if (!this.user) return;
        
        const avatar = document.querySelector('.user-avatar');
        const name = document.querySelector('.user-name');
        const role = document.querySelector('.user-role');
        
        if (avatar) avatar.textContent = this.user.full_name?.charAt(0).toUpperCase() || 'U';
        if (name) name.textContent = this.user.full_name || 'User';
        if (role) role.textContent = this.formatRole(this.user.role);
        
        this.updateNavigation();
    }

    formatRole(role) {
        const roleNames = {
            'phc_admin': 'PHC Admin',
            'phc_staff': 'PHC Staff',
            'chw': 'Community Health Worker',
            'mother': 'Mother'
        };
        return roleNames[role] || role;
    }

    updateNavigation() {
        const navItems = document.querySelectorAll('.nav-item');
        const role = this.user?.role;

        navItems.forEach(item => {
            const allowedRoles = item.dataset.roles?.split(',') || [];
            if (allowedRoles.length === 0 || allowedRoles.includes(role)) {
                item.style.display = 'flex';
            } else {
                item.style.display = 'none';
            }
        });
    }

    navigateTo(page) {
        this.currentPage = page;
        
        document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
        document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
        
        const pageElement = document.getElementById(`page-${page}`);
        const navElement = document.querySelector(`.nav-item[data-page="${page}"]`);
        
        if (pageElement) pageElement.classList.add('active');
        if (navElement) navElement.classList.add('active');
        
        this.loadPageData(page);
    }

    async loadPageData(page) {
        switch (page) {
            case 'dashboard':
                await this.loadDashboard();
                break;
            case 'mothers':
                await this.loadMothers();
                break;
            case 'triage':
                this.initTriageForm();
                break;
            case 'visits':
                await this.loadVisits();
                break;
            case 'emergency':
                await this.loadEmergency();
                break;
            case 'education':
                await this.loadEducation();
                break;
            case 'nataband':
                this.initNataBand();
                break;
            case 'notifications':
                await this.loadNotifications();
                break;
        }
    }

    showPage(page) {
        document.querySelectorAll('.auth-page').forEach(p => p.classList.remove('active'));
        document.getElementById(`${page}-page`)?.classList.add('active');
    }

    async handleLogin(e) {
        e.preventDefault();
        const form = e.target;
        const email = form.querySelector('[name="email"]').value;
        const password = form.querySelector('[name="password"]').value;
        
        try {
            this.showLoading(true);
            const result = await api.login({ email, password });
            this.user = result.user;
            this.showApp();
            this.navigateTo('dashboard');
            this.showToast('Welcome back!', 'success');
        } catch (error) {
            this.showToast(error.message, 'error');
        } finally {
            this.showLoading(false);
        }
    }

    async handleRegister(e) {
        e.preventDefault();
        const form = e.target;
        const data = {
            full_name: form.querySelector('[name="full_name"]').value,
            email: form.querySelector('[name="email"]').value,
            phone: form.querySelector('[name="phone"]').value,
            password: form.querySelector('[name="password"]').value,
            role: form.querySelector('[name="role"]').value
        };
        
        try {
            this.showLoading(true);
            const result = await api.register(data);
            this.user = result.user;
            this.showApp();
            this.navigateTo('dashboard');
            this.showToast('Registration successful!', 'success');
        } catch (error) {
            this.showToast(error.message, 'error');
        } finally {
            this.showLoading(false);
        }
    }

    async logout() {
        await api.logout();
        this.user = null;
        this.showAuth();
        this.showToast('Logged out successfully', 'info');
    }

    async loadDashboard() {
        const container = document.getElementById('dashboard-content');
        if (!container) return;

        try {
            if (this.user.role === 'mother') {
                await this.loadMotherDashboard(container);
            } else {
                await this.loadStaffDashboard(container);
            }
        } catch (error) {
            container.innerHTML = `<div class="alert-card danger">${error.message}</div>`;
        }
    }

    async loadStaffDashboard(container) {
        try {
            const stats = await api.getDashboardStats();
            const highRisk = await api.getHighRiskMothers();
            
            container.innerHTML = `
                <div class="dashboard-grid">
                    <div class="glass-card stat-card">
                        <div class="stat-header">
                            <div class="stat-icon primary">
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                                    <circle cx="9" cy="7" r="4"/>
                                    <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                                    <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                                </svg>
                            </div>
                        </div>
                        <div class="stat-value">${stats.total_mothers || 0}</div>
                        <div class="stat-label">Total Mothers</div>
                    </div>
                    
                    <div class="glass-card stat-card">
                        <div class="stat-header">
                            <div class="stat-icon danger">
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                                    <line x1="12" y1="9" x2="12" y2="13"/>
                                    <line x1="12" y1="17" x2="12.01" y2="17"/>
                                </svg>
                            </div>
                        </div>
                        <div class="stat-value">${(stats.risk_breakdown?.high_risk || 0) + (stats.risk_breakdown?.emergency || 0)}</div>
                        <div class="stat-label">High Risk Cases</div>
                    </div>
                    
                    <div class="glass-card stat-card">
                        <div class="stat-header">
                            <div class="stat-icon warning">
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <circle cx="12" cy="12" r="10"/>
                                    <polyline points="12 6 12 12 16 14"/>
                                </svg>
                            </div>
                        </div>
                        <div class="stat-value">${stats.missed_anc || 0}</div>
                        <div class="stat-label">Missed ANC</div>
                    </div>
                    
                    <div class="glass-card stat-card">
                        <div class="stat-header">
                            <div class="stat-icon success">
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                                    <polyline points="22 4 12 14.01 9 11.01"/>
                                </svg>
                            </div>
                        </div>
                        <div class="stat-value">${stats.followup_progress?.visited || 0}/${stats.followup_progress?.assigned || 0}</div>
                        <div class="stat-label">Follow-ups Complete</div>
                    </div>
                </div>
                
                <div class="glass-card">
                    <div class="section-header">
                        <h3 class="section-title">High Risk Mothers</h3>
                        <button class="btn btn-sm btn-outline" onclick="app.navigateTo('mothers')">View All</button>
                    </div>
                    <div id="high-risk-list">
                        ${highRisk.length === 0 ? '<p class="text-secondary">No high risk cases</p>' : 
                            highRisk.slice(0, 5).map(m => `
                                <div class="mother-card" onclick="app.viewMother(${m.id})">
                                    <div class="mother-avatar">${m.full_name?.charAt(0) || '?'}</div>
                                    <div class="mother-info">
                                        <div class="mother-name">${m.full_name}</div>
                                        <div class="mother-meta">${m.lga_community || 'N/A'} | Age: ${m.age || 'N/A'}</div>
                                    </div>
                                    <span class="risk-badge ${m.risk_level}">${m.risk_level?.replace('_', ' ')}</span>
                                </div>
                            `).join('')
                        }
                    </div>
                </div>
                
                ${stats.active_emergencies > 0 ? `
                    <div class="alert-card danger">
                        <strong>Active Emergencies: ${stats.active_emergencies}</strong>
                        <p>There are active emergency alerts requiring attention.</p>
                        <button class="btn btn-danger btn-sm" onclick="app.navigateTo('emergency')">View Emergencies</button>
                    </div>
                ` : ''}
            `;
        } catch (error) {
            container.innerHTML = `<div class="alert-card danger">Failed to load dashboard: ${error.message}</div>`;
        }
    }

    async loadMotherDashboard(container) {
        container.innerHTML = `
            <div class="glass-card" style="text-align: center; padding: 40px;">
                <h2>Welcome, ${this.user.full_name}</h2>
                <p style="color: var(--text-secondary); margin: 16px 0;">Track your pregnancy journey with NataBridge</p>
                
                <button class="btn btn-emergency" onclick="app.raiseEmergency()" style="margin: 24px 0;">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
                    </svg>
                    Emergency Alert
                </button>
            </div>
            
            <div class="glass-card" style="margin-top: 20px;">
                <h3 class="section-title">Quick Actions</h3>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 16px;">
                    <button class="btn btn-secondary" onclick="app.navigateTo('education')">
                        Learn About Pregnancy
                    </button>
                    <button class="btn btn-secondary" onclick="app.navigateTo('emergency')">
                        Emergency Contacts
                    </button>
                </div>
            </div>
        `;
    }

    async loadMothers() {
        const container = document.getElementById('mothers-list');
        if (!container) return;

        try {
            const mothers = await api.getMothers();
            
            if (mothers.length === 0) {
                container.innerHTML = '<p class="text-secondary">No mothers registered yet.</p>';
                return;
            }
            
            container.innerHTML = mothers.map(m => `
                <div class="mother-card" onclick="app.viewMother(${m.id})">
                    <div class="mother-avatar">${m.full_name?.charAt(0) || '?'}</div>
                    <div class="mother-info">
                        <div class="mother-name">${m.full_name}</div>
                        <div class="mother-meta">
                            ${m.phone || 'No phone'} | ${m.lga_community || 'N/A'}
                        </div>
                    </div>
                    <span class="risk-badge ${m.risk_level || 'normal'}">${(m.risk_level || 'normal').replace('_', ' ')}</span>
                </div>
            `).join('');
        } catch (error) {
            container.innerHTML = `<div class="alert-card danger">${error.message}</div>`;
        }
    }

    openMotherModal() {
        document.getElementById('mother-modal').classList.add('active');
    }

    closeMotherModal() {
        document.getElementById('mother-modal').classList.remove('active');
    }

    async submitMotherForm(e) {
        e.preventDefault();
        const form = e.target;
        
        const data = {
            full_name: form.querySelector('[name="full_name"]').value,
            age: parseInt(form.querySelector('[name="age"]').value) || null,
            phone: form.querySelector('[name="phone"]').value,
            address: form.querySelector('[name="address"]').value,
            lga_community: form.querySelector('[name="lga_community"]').value,
            parity: parseInt(form.querySelector('[name="parity"]').value) || 0,
            gravidity: parseInt(form.querySelector('[name="gravidity"]').value) || 0,
            previous_outcomes: form.querySelector('[name="previous_outcomes"]').value,
            pre_existing_conditions: form.querySelector('[name="pre_existing_conditions"]').value,
            current_pregnancy_details: form.querySelector('[name="current_pregnancy_details"]').value,
            next_appointment: form.querySelector('[name="next_appointment"]').value || null
        };

        try {
            this.showLoading(true);
            const result = await api.registerMother(data);
            this.showToast(result.offline ? result.message : 'Mother registered successfully!', 'success');
            this.closeMotherModal();
            form.reset();
            await this.loadMothers();
        } catch (error) {
            this.showToast(error.message, 'error');
        } finally {
            this.showLoading(false);
        }
    }

    async viewMother(id) {
        const mother = await api.getMother(id);
        if (!mother) {
            this.showToast('Mother not found', 'error');
            return;
        }
        
        const content = document.getElementById('mother-detail-content');
        content.innerHTML = `
            <div style="display: flex; align-items: center; gap: 16px; margin-bottom: 24px;">
                <div class="mother-avatar" style="width: 64px; height: 64px; font-size: 24px;">
                    ${mother.full_name?.charAt(0) || '?'}
                </div>
                <div>
                    <h2 style="margin: 0;">${mother.full_name}</h2>
                    <span class="risk-badge ${mother.risk_level || 'normal'}">${(mother.risk_level || 'normal').replace('_', ' ')}</span>
                </div>
            </div>
            
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
                <div><strong>Age:</strong> ${mother.age || 'N/A'}</div>
                <div><strong>Phone:</strong> ${mother.phone || 'N/A'}</div>
                <div><strong>Address:</strong> ${mother.address || 'N/A'}</div>
                <div><strong>LGA/Community:</strong> ${mother.lga_community || 'N/A'}</div>
                <div><strong>Parity:</strong> ${mother.parity || 0}</div>
                <div><strong>Gravidity:</strong> ${mother.gravidity || 0}</div>
            </div>
            
            <div style="margin-top: 16px;">
                <strong>Pre-existing Conditions:</strong>
                <p>${mother.pre_existing_conditions || 'None reported'}</p>
            </div>
            
            <div style="margin-top: 16px;">
                <strong>Current Pregnancy Details:</strong>
                <p>${mother.current_pregnancy_details || 'No details'}</p>
            </div>
            
            <div style="margin-top: 16px;">
                <strong>Next Appointment:</strong>
                <p>${mother.next_appointment ? new Date(mother.next_appointment).toLocaleDateString() : 'Not scheduled'}</p>
            </div>
            
            <div style="display: flex; gap: 12px; margin-top: 24px;">
                <button class="btn btn-primary" onclick="app.startTriage(${mother.id})">Start Triage</button>
                ${this.user.role === 'chw' ? `<button class="btn btn-secondary" onclick="app.recordVisit(${mother.id})">Record Visit</button>` : ''}
            </div>
        `;
        
        document.getElementById('mother-detail-modal').classList.add('active');
    }

    closeMotherDetail() {
        document.getElementById('mother-detail-modal').classList.remove('active');
    }

    initTriageForm() {
        const form = document.getElementById('triage-form');
        if (!form) return;
        
        const symptoms = [
            { id: 'severe_headache', label: 'Severe Headache' },
            { id: 'blurred_vision', label: 'Blurred Vision' },
            { id: 'convulsions', label: 'Convulsions/Fits' },
            { id: 'severe_abdominal_pain', label: 'Severe Abdominal Pain' },
            { id: 'vaginal_bleeding', label: 'Vaginal Bleeding' },
            { id: 'fever', label: 'Fever' },
            { id: 'reduced_fetal_movement', label: 'Reduced Fetal Movement' },
            { id: 'swelling_face_hands', label: 'Swelling (Face/Hands)' },
            { id: 'difficulty_breathing', label: 'Difficulty Breathing' },
            { id: 'chest_pain', label: 'Chest Pain' },
            { id: 'severe_vomiting', label: 'Severe Vomiting' },
            { id: 'water_breaking_early', label: 'Water Breaking Early' }
        ];
        
        document.getElementById('symptoms-grid').innerHTML = symptoms.map(s => `
            <label class="symptom-checkbox">
                <input type="checkbox" name="symptom" value="${s.id}">
                <span>${s.label}</span>
            </label>
        `).join('');
        
        document.querySelectorAll('.symptom-checkbox').forEach(el => {
            el.addEventListener('click', function() {
                this.classList.toggle('checked', this.querySelector('input').checked);
            });
        });
    }

    async startTriage(motherId) {
        this.closeMotherDetail();
        this.navigateTo('triage');
        document.getElementById('triage-mother-id').value = motherId;
    }

    async submitTriage(e) {
        e.preventDefault();
        const form = e.target;
        
        const symptoms = Array.from(form.querySelectorAll('[name="symptom"]:checked')).map(el => el.value);
        
        const data = {
            mother_id: parseInt(form.querySelector('[name="mother_id"]').value),
            symptoms,
            bp_systolic: parseInt(form.querySelector('[name="bp_systolic"]').value) || null,
            bp_diastolic: parseInt(form.querySelector('[name="bp_diastolic"]').value) || null,
            heart_rate: parseInt(form.querySelector('[name="heart_rate"]').value) || null,
            temperature: parseFloat(form.querySelector('[name="temperature"]').value) || null,
            spo2: parseInt(form.querySelector('[name="spo2"]').value) || null,
            notes: form.querySelector('[name="notes"]').value
        };

        if (!data.mother_id) {
            this.showToast('Please select a mother first', 'error');
            return;
        }

        try {
            this.showLoading(true);
            const result = await api.createTriage(data);
            
            const resultContainer = document.getElementById('triage-result');
            const riskScore = result.risk_score;
            
            resultContainer.innerHTML = `
                <div class="risk-result ${riskScore.level}">
                    <div class="risk-score-value">${riskScore.score}</div>
                    <div class="risk-level-text">${riskScore.level.replace('_', ' ')}</div>
                    ${riskScore.factors.length > 0 ? `
                        <p style="margin-top: 16px;">Risk Factors: ${riskScore.factors.join(', ')}</p>
                    ` : ''}
                </div>
                
                ${riskScore.level === 'emergency' ? `
                    <div class="alert-card danger">
                        <strong>EMERGENCY: Immediate medical attention required!</strong>
                        <button class="btn btn-danger" onclick="app.navigateTo('emergency')" style="margin-top: 12px;">
                            Emergency Services
                        </button>
                    </div>
                ` : riskScore.level === 'high_risk' ? `
                    <div class="alert-card warning">
                        <strong>High Risk: Schedule follow-up immediately</strong>
                        <p>This mother has been added to the priority follow-up list.</p>
                    </div>
                ` : ''}
            `;
            
            resultContainer.style.display = 'block';
            this.showToast('Triage completed!', 'success');
            form.reset();
        } catch (error) {
            this.showToast(error.message, 'error');
        } finally {
            this.showLoading(false);
        }
    }

    async loadVisits() {
        const container = document.getElementById('visits-content');
        if (!container || this.user.role !== 'chw') return;

        try {
            const assignments = await api.getCHWAssignments();
            
            container.innerHTML = `
                <div class="section-header">
                    <h3 class="section-title">Assigned Mothers</h3>
                </div>
                ${assignments.length === 0 ? '<p>No mothers assigned yet.</p>' : 
                    assignments.map(m => `
                        <div class="mother-card">
                            <div class="mother-avatar">${m.full_name?.charAt(0) || '?'}</div>
                            <div class="mother-info">
                                <div class="mother-name">${m.full_name}</div>
                                <div class="mother-meta">${m.address || 'N/A'}</div>
                            </div>
                            <span class="risk-badge ${m.priority || 'normal'}">${(m.priority || 'normal').replace('_', ' ')}</span>
                            <button class="btn btn-sm btn-primary" onclick="app.recordVisit(${m.id})">Record Visit</button>
                        </div>
                    `).join('')
                }
            `;
        } catch (error) {
            container.innerHTML = `<div class="alert-card danger">${error.message}</div>`;
        }
    }

    recordVisit(motherId) {
        const modal = document.getElementById('visit-modal');
        document.getElementById('visit-mother-id').value = motherId;
        modal.classList.add('active');
    }

    closeVisitModal() {
        document.getElementById('visit-modal').classList.remove('active');
    }

    async submitVisit(e) {
        e.preventDefault();
        const form = e.target;
        
        const symptoms = Array.from(form.querySelectorAll('[name="symptom"]:checked')).map(el => el.value);
        const dangerSigns = Array.from(form.querySelectorAll('[name="danger_sign"]:checked')).map(el => el.value);
        
        const data = {
            mother_id: parseInt(form.querySelector('[name="mother_id"]').value),
            mother_condition: form.querySelector('[name="mother_condition"]').value,
            symptoms_observed: symptoms,
            danger_signs: dangerSigns,
            vitals: {
                bp_systolic: form.querySelector('[name="bp_systolic"]')?.value,
                bp_diastolic: form.querySelector('[name="bp_diastolic"]')?.value,
                heart_rate: form.querySelector('[name="heart_rate"]')?.value
            },
            referral_needed: form.querySelector('[name="referral_needed"]')?.checked || false,
            notes: form.querySelector('[name="notes"]').value,
            next_visit_date: form.querySelector('[name="next_visit_date"]').value
        };

        try {
            this.showLoading(true);
            const result = await api.createVisit(data);
            this.showToast(result.offline ? result.message : 'Visit recorded!', 'success');
            this.closeVisitModal();
            form.reset();
        } catch (error) {
            this.showToast(error.message, 'error');
        } finally {
            this.showLoading(false);
        }
    }

    async loadEmergency() {
        const container = document.getElementById('emergency-content');
        if (!container) return;

        try {
            const contacts = await api.getTransportContacts();
            
            container.innerHTML = `
                <div class="emergency-container">
                    <div class="emergency-icon">
                        <svg width="50" height="50" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
                        </svg>
                    </div>
                    
                    <h2 class="emergency-title">Emergency Services</h2>
                    <p class="emergency-description">In case of emergency, contact transport services immediately or raise an alert.</p>
                    
                    <button class="btn btn-emergency btn-block" onclick="app.raiseEmergency()">
                        Raise Emergency Alert
                    </button>
                    
                    <div class="transport-list">
                        <h3 style="margin: 24px 0 16px; text-align: left;">Transport Contacts</h3>
                        ${contacts.map(c => `
                            <div class="transport-item">
                                <div class="transport-icon">
                                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        ${c.type === 'ambulance' ? '<rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>' : 
                                          c.type === 'tricycle' ? '<circle cx="5.5" cy="17.5" r="3.5"/><circle cx="18.5" cy="17.5" r="3.5"/><path d="M15 6h-5l-3 8h8z"/>' :
                                          '<path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9L18 10l-2-4H8L6 10l-2.5 1.1c-.8.2-1.5 1-1.5 1.9v3c0 .6.4 1 1 1h2"/><circle cx="7" cy="17" r="2"/><circle cx="17" cy="17" r="2"/>'}
                                    </svg>
                                </div>
                                <div class="transport-info">
                                    <div class="transport-name">${c.name}</div>
                                    <div class="transport-type">${c.type} | ${c.lga_community}</div>
                                </div>
                                <a href="tel:${c.phone}" class="transport-call">
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
                                    </svg>
                                </a>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        } catch (error) {
            container.innerHTML = `<div class="alert-card danger">${error.message}</div>`;
        }
    }

    async raiseEmergency() {
        let location = null;
        
        if ('geolocation' in navigator) {
            try {
                const pos = await new Promise((resolve, reject) => {
                    navigator.geolocation.getCurrentPosition(resolve, reject, {
                        enableHighAccuracy: true,
                        timeout: 5000
                    });
                });
                location = {
                    lat: pos.coords.latitude,
                    lng: pos.coords.longitude
                };
            } catch (e) {
                console.log('Geolocation not available');
            }
        }

        const description = prompt('Describe the emergency (optional):');
        
        try {
            this.showLoading(true);
            const result = await api.createEmergencyAlert({
                alert_type: 'emergency',
                description: description || 'Emergency alert raised',
                location_lat: location?.lat,
                location_lng: location?.lng
            });
            
            this.showToast(result.offline ? 'Emergency alert queued' : 'Emergency alert sent!', 'warning');
        } catch (error) {
            this.showToast(error.message, 'error');
        } finally {
            this.showLoading(false);
        }
    }

    async loadEducation() {
        const container = document.getElementById('education-content');
        if (!container) return;

        const currentLanguage = localStorage.getItem('education_language') || 'english';
        
        try {
            const categories = await api.getEducationCategories();
            const modules = await api.getEducationModules(currentLanguage);
            
            container.innerHTML = `
                <div class="language-tabs">
                    ${['english', 'yoruba', 'hausa', 'igbo', 'pidgin'].map(lang => `
                        <button class="language-tab ${lang === currentLanguage ? 'active' : ''}" 
                                onclick="app.changeLanguage('${lang}')">
                            ${lang.charAt(0).toUpperCase() + lang.slice(1)}
                        </button>
                    `).join('')}
                </div>
                
                <div class="education-categories">
                    ${categories.map(cat => {
                        const catModules = modules.filter(m => m.category === cat.id);
                        return `
                            <div class="glass-card category-card" onclick="app.viewCategory('${cat.id}', '${currentLanguage}')">
                                <div class="icon-wrapper">
                                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        ${this.getCategoryIcon(cat.icon)}
                                    </svg>
                                </div>
                                <h3>${cat.name}</h3>
                                <p>${catModules.length} modules available</p>
                            </div>
                        `;
                    }).join('')}
                </div>
            `;
        } catch (error) {
            container.innerHTML = `<div class="alert-card danger">${error.message}</div>`;
        }
    }

    getCategoryIcon(icon) {
        const icons = {
            'calendar-check': '<rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><path d="M9 16l2 2 4-4"/>',
            'alert-triangle': '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
            'apple': '<path d="M12 2a5 5 0 0 0-5 5v1H6a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-9a2 2 0 0 0-2-2h-1V7a5 5 0 0 0-5-5z"/>',
            'baby': '<circle cx="12" cy="8" r="5"/><path d="M20 21a8 8 0 1 0-16 0"/>',
            'heart': '<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>'
        };
        return icons[icon] || icons['heart'];
    }

    async changeLanguage(language) {
        localStorage.setItem('education_language', language);
        await this.loadEducation();
    }

    async viewCategory(categoryId, language) {
        const modules = await api.getEducationModules(language, categoryId);
        
        const content = document.getElementById('education-module-content');
        content.innerHTML = modules.map(m => `
            <div class="module-content glass-card" style="margin-bottom: 16px;">
                <h2>${m.title}</h2>
                <p>${m.content}</p>
            </div>
        `).join('');
        
        document.getElementById('education-module-modal').classList.add('active');
    }

    closeEducationModal() {
        document.getElementById('education-module-modal').classList.remove('active');
    }

    initNataBand() {
        const container = document.getElementById('nataband-content');
        if (!container) return;
        
        container.innerHTML = `
            <div class="glass-card">
                <h3 class="section-title">Manual Vital Entry</h3>
                <p style="color: var(--text-secondary); margin-bottom: 24px;">
                    Enter vital signs from NataBand device or manual measurement
                </p>
                
                <form id="nataband-form" onsubmit="app.submitNataBand(event)">
                    <div class="form-group">
                        <label class="form-label">Mother ID</label>
                        <input type="number" name="mother_id" class="form-input" required placeholder="Enter mother ID">
                    </div>
                    
                    <div class="vitals-grid">
                        <div class="form-group">
                            <label class="form-label">Heart Rate (bpm)</label>
                            <input type="number" name="heart_rate" class="form-input" placeholder="e.g., 75">
                        </div>
                        <div class="form-group">
                            <label class="form-label">BP Systolic (mmHg)</label>
                            <input type="number" name="bp_systolic" class="form-input" placeholder="e.g., 120">
                        </div>
                        <div class="form-group">
                            <label class="form-label">BP Diastolic (mmHg)</label>
                            <input type="number" name="bp_diastolic" class="form-input" placeholder="e.g., 80">
                        </div>
                        <div class="form-group">
                            <label class="form-label">Temperature (°C)</label>
                            <input type="number" step="0.1" name="temperature" class="form-input" placeholder="e.g., 36.5">
                        </div>
                        <div class="form-group">
                            <label class="form-label">SpO2 (%)</label>
                            <input type="number" name="spo2" class="form-input" placeholder="e.g., 98">
                        </div>
                        <div class="form-group">
                            <label class="form-label">Device ID (optional)</label>
                            <input type="text" name="device_id" class="form-input" placeholder="NB-XXXXX">
                        </div>
                    </div>
                    
                    <button type="submit" class="btn btn-primary btn-block" style="margin-top: 24px;">
                        Record Vitals
                    </button>
                </form>
            </div>
            
            <div id="nataband-alerts" style="margin-top: 24px;"></div>
        `;
    }

    async submitNataBand(e) {
        e.preventDefault();
        const form = e.target;
        
        const data = {
            mother_id: parseInt(form.querySelector('[name="mother_id"]').value),
            heart_rate: parseInt(form.querySelector('[name="heart_rate"]').value) || null,
            bp_systolic: parseInt(form.querySelector('[name="bp_systolic"]').value) || null,
            bp_diastolic: parseInt(form.querySelector('[name="bp_diastolic"]').value) || null,
            temperature: parseFloat(form.querySelector('[name="temperature"]').value) || null,
            spo2: parseInt(form.querySelector('[name="spo2"]').value) || null,
            device_id: form.querySelector('[name="device_id"]').value || null,
            source: 'manual'
        };

        try {
            this.showLoading(true);
            const result = await api.recordNataBandVitals(data);
            
            const alertsContainer = document.getElementById('nataband-alerts');
            if (result.alerts && result.alerts.length > 0) {
                alertsContainer.innerHTML = result.alerts.map(a => `
                    <div class="alert-card ${a.priority === 'critical' ? 'danger' : 'warning'}">
                        <strong>${a.title}</strong>
                        <p>${a.message}</p>
                    </div>
                `).join('');
            } else {
                alertsContainer.innerHTML = `
                    <div class="alert-card success">
                        <strong>Vitals Normal</strong>
                        <p>All readings are within normal range.</p>
                    </div>
                `;
            }
            
            this.showToast('Vitals recorded successfully!', 'success');
            form.reset();
        } catch (error) {
            this.showToast(error.message, 'error');
        } finally {
            this.showLoading(false);
        }
    }

    async loadNotifications() {
        const container = document.getElementById('notifications-content');
        if (!container) return;

        try {
            const notifications = await api.getNotifications();
            
            if (notifications.length === 0) {
                container.innerHTML = '<p class="text-secondary">No notifications yet.</p>';
                return;
            }
            
            container.innerHTML = notifications.map(n => `
                <div class="notification-item ${n.is_read ? '' : 'unread'} ${n.priority === 'critical' ? 'critical' : ''}"
                     onclick="app.markNotificationRead(${n.id})">
                    <div class="notification-title">${n.title}</div>
                    <div class="notification-message">${n.message || ''}</div>
                    <div class="notification-time">${this.formatDate(n.created_at)}</div>
                </div>
            `).join('');
        } catch (error) {
            container.innerHTML = `<div class="alert-card danger">${error.message}</div>`;
        }
    }

    async markNotificationRead(id) {
        try {
            await api.markNotificationRead(id);
            await this.loadNotifications();
        } catch (error) {
            console.error('Failed to mark notification as read:', error);
        }
    }

    formatDate(dateStr) {
        if (!dateStr) return '';
        const date = new Date(dateStr);
        const now = new Date();
        const diff = now - date;
        
        if (diff < 60000) return 'Just now';
        if (diff < 3600000) return `${Math.floor(diff/60000)} minutes ago`;
        if (diff < 86400000) return `${Math.floor(diff/3600000)} hours ago`;
        return date.toLocaleDateString();
    }

    toggleNotifications() {
        const panel = document.getElementById('notifications-panel');
        panel.classList.toggle('active');
        if (panel.classList.contains('active')) {
            this.loadNotificationsPanel();
        }
    }

    async loadNotificationsPanel() {
        const list = document.querySelector('.notifications-list');
        if (!list) return;
        
        try {
            const notifications = await api.getNotifications();
            list.innerHTML = notifications.slice(0, 10).map(n => `
                <div class="notification-item ${n.is_read ? '' : 'unread'}">
                    <div class="notification-title">${n.title}</div>
                    <div class="notification-message">${n.message || ''}</div>
                    <div class="notification-time">${this.formatDate(n.created_at)}</div>
                </div>
            `).join('') || '<p>No notifications</p>';
        } catch (error) {
            list.innerHTML = '<p>Failed to load notifications</p>';
        }
    }

    showLoading(show) {
        const overlay = document.getElementById('loading-overlay');
        if (overlay) {
            overlay.style.display = show ? 'flex' : 'none';
        }
    }

    showToast(message, type = 'info') {
        const container = document.getElementById('toast-container');
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;
        container.appendChild(toast);
        
        setTimeout(() => toast.classList.add('show'), 10);
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }
}

let app;
document.addEventListener('DOMContentLoaded', () => {
    app = new NataBridgeApp();
});
