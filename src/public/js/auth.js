// Управление аутентификацией
export class AuthManager {
    constructor() {
        this.token = localStorage.getItem('authToken');
        this.currentUser = null;
        this.loadUser();
    }

    loadUser() {
        const saved = localStorage.getItem('currentUser');
        if (saved) {
            try {
                this.currentUser = JSON.parse(saved);
                console.log(`👤 Пользователь: ${this.currentUser.name} (${this.currentUser.position})`);
            } catch(e) {
                this.clear();
            }
        }
    }

    isAuthenticated() {
        return !!this.token && !!this.currentUser;
    }

    getUser() {
        return this.currentUser;
    }

    getToken() {
        return this.token;
    }

    async login(login, password) {
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ login, password })
        });
        const data = await response.json();
        if (data.success) {
            this.token = data.token;
            this.currentUser = data.user;
            localStorage.setItem('authToken', this.token);
            localStorage.setItem('currentUser', JSON.stringify(this.currentUser));
            return true;
        }
        return false;
    }

    async logout() {
        if (this.token) {
            await fetch('/api/logout', {
                method: 'POST',
                headers: { 'x-auth-token': this.token }
            }).catch(() => {});
        }
        this.clear();
        window.location.href = '/login-modal.html';
    }

    clear() {
        this.token = null;
        this.currentUser = null;
        localStorage.removeItem('authToken');
        localStorage.removeItem('currentUser');
    }
}