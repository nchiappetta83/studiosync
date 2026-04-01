class Auth {
  constructor(db) {
    this.db = db;
    this._currentUser = null;
    this._username = null;
  }

  setUsername(username) {
    this._username = username;
    this._currentUser = null;
  }

  getCurrentUser() {
    if (this._currentUser) return this._currentUser;
    if (!this._username) return null;
    this._currentUser = this.db.getUserByUsername(this._username);
    return this._currentUser;
  }

  isPartner() {
    const user = this.getCurrentUser();
    return user && user.role === 'partner';
  }

  isAdmin() {
    const user = this.getCurrentUser();
    return user && (user.is_admin === 1 || user.role === 'partner');
  }

  isStaff() {
    const user = this.getCurrentUser();
    return user && user.role === 'staff';
  }

  isSetup() {
    return this.getCurrentUser() !== null;
  }

  clearCache() {
    this._currentUser = null;
  }
}

module.exports = Auth;
