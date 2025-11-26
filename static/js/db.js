const DB_NAME = 'NataBridgeDB';
const DB_VERSION = 1;

const STORES = {
    MOTHERS: 'mothers',
    VISITS: 'visits',
    TRIAGE: 'triage',
    EDUCATION: 'education',
    NOTIFICATIONS: 'notifications',
    SYNC_QUEUE: 'syncQueue',
    USER: 'user',
    TRANSPORT: 'transport'
};

class LocalDatabase {
    constructor() {
        this.db = null;
        this.isReady = false;
    }

    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onerror = () => {
                console.error('IndexedDB error:', request.error);
                reject(request.error);
            };

            request.onsuccess = () => {
                this.db = request.result;
                this.isReady = true;
                console.log('IndexedDB initialized');
                resolve(this.db);
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;

                if (!db.objectStoreNames.contains(STORES.MOTHERS)) {
                    const mothersStore = db.createObjectStore(STORES.MOTHERS, { keyPath: 'id', autoIncrement: true });
                    mothersStore.createIndex('phone', 'phone', { unique: false });
                    mothersStore.createIndex('risk_level', 'risk_level', { unique: false });
                    mothersStore.createIndex('synced', 'synced', { unique: false });
                }

                if (!db.objectStoreNames.contains(STORES.VISITS)) {
                    const visitsStore = db.createObjectStore(STORES.VISITS, { keyPath: 'id', autoIncrement: true });
                    visitsStore.createIndex('mother_id', 'mother_id', { unique: false });
                    visitsStore.createIndex('synced', 'synced', { unique: false });
                }

                if (!db.objectStoreNames.contains(STORES.TRIAGE)) {
                    const triageStore = db.createObjectStore(STORES.TRIAGE, { keyPath: 'id', autoIncrement: true });
                    triageStore.createIndex('mother_id', 'mother_id', { unique: false });
                    triageStore.createIndex('synced', 'synced', { unique: false });
                }

                if (!db.objectStoreNames.contains(STORES.EDUCATION)) {
                    const educationStore = db.createObjectStore(STORES.EDUCATION, { keyPath: 'id' });
                    educationStore.createIndex('category', 'category', { unique: false });
                    educationStore.createIndex('language', 'language', { unique: false });
                }

                if (!db.objectStoreNames.contains(STORES.NOTIFICATIONS)) {
                    const notificationsStore = db.createObjectStore(STORES.NOTIFICATIONS, { keyPath: 'id', autoIncrement: true });
                    notificationsStore.createIndex('is_read', 'is_read', { unique: false });
                    notificationsStore.createIndex('created_at', 'created_at', { unique: false });
                }

                if (!db.objectStoreNames.contains(STORES.SYNC_QUEUE)) {
                    const syncStore = db.createObjectStore(STORES.SYNC_QUEUE, { keyPath: 'id', autoIncrement: true });
                    syncStore.createIndex('table', 'table', { unique: false });
                    syncStore.createIndex('created_at', 'created_at', { unique: false });
                }

                if (!db.objectStoreNames.contains(STORES.USER)) {
                    db.createObjectStore(STORES.USER, { keyPath: 'id' });
                }

                if (!db.objectStoreNames.contains(STORES.TRANSPORT)) {
                    const transportStore = db.createObjectStore(STORES.TRANSPORT, { keyPath: 'id' });
                    transportStore.createIndex('type', 'type', { unique: false });
                }
            };
        });
    }

    async add(storeName, data) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(storeName, 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.add({ ...data, synced: false, created_at: new Date().toISOString() });

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async put(storeName, data) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(storeName, 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.put({ ...data, updated_at: new Date().toISOString() });

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async get(storeName, id) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(storeName, 'readonly');
            const store = transaction.objectStore(storeName);
            const request = store.get(id);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async getAll(storeName) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(storeName, 'readonly');
            const store = transaction.objectStore(storeName);
            const request = store.getAll();

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async getByIndex(storeName, indexName, value) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(storeName, 'readonly');
            const store = transaction.objectStore(storeName);
            const index = store.index(indexName);
            const request = index.getAll(value);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async delete(storeName, id) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(storeName, 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.delete(id);

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    async clear(storeName) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(storeName, 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.clear();

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    async addToSyncQueue(table, action, data) {
        return this.add(STORES.SYNC_QUEUE, {
            table,
            action,
            data,
            local_id: data.id || Date.now()
        });
    }

    async getSyncQueue() {
        return this.getAll(STORES.SYNC_QUEUE);
    }

    async clearSyncQueue() {
        return this.clear(STORES.SYNC_QUEUE);
    }

    async getUnsynced(storeName) {
        return this.getByIndex(storeName, 'synced', false);
    }

    async markSynced(storeName, id) {
        const item = await this.get(storeName, id);
        if (item) {
            item.synced = true;
            return this.put(storeName, item);
        }
    }

    async saveUser(user) {
        return this.put(STORES.USER, { id: 'current', ...user });
    }

    async getUser() {
        return this.get(STORES.USER, 'current');
    }

    async clearUser() {
        return this.delete(STORES.USER, 'current');
    }

    async cacheEducationModules(modules) {
        const transaction = this.db.transaction(STORES.EDUCATION, 'readwrite');
        const store = transaction.objectStore(STORES.EDUCATION);
        
        for (const module of modules) {
            store.put(module);
        }
        
        return new Promise((resolve, reject) => {
            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error);
        });
    }

    async getEducationModules(language, category = null) {
        const modules = await this.getByIndex(STORES.EDUCATION, 'language', language);
        if (category) {
            return modules.filter(m => m.category === category);
        }
        return modules;
    }

    async cacheTransportContacts(contacts) {
        const transaction = this.db.transaction(STORES.TRANSPORT, 'readwrite');
        const store = transaction.objectStore(STORES.TRANSPORT);
        
        for (const contact of contacts) {
            store.put(contact);
        }
        
        return new Promise((resolve, reject) => {
            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error);
        });
    }

    async getTransportContacts() {
        return this.getAll(STORES.TRANSPORT);
    }
}

const localDB = new LocalDatabase();

window.localDB = localDB;
window.STORES = STORES;
