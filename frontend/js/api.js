/* =========================================================
   FAMIPET - API CLIENT (Integration Layer)
   Handles auth token, headers, and backend communication.
   ========================================================= */

const FamiPetAPI = (function () {

    const API_BASE = "http://localhost:5000/api";
    const TOKEN_KEY = "famipetToken";
    const USER_KEY = "famipetUser";

    /* ---------------- TOKEN / USER ---------------- */

    function getToken() {
        return localStorage.getItem(TOKEN_KEY) || "";
    }

    function setToken(token) {
        if (token) {
            localStorage.setItem(TOKEN_KEY, token);
        } else {
            localStorage.removeItem(TOKEN_KEY);
        }
    }

    function getUser() {
        try {
            return JSON.parse(localStorage.getItem(USER_KEY) || "null");
        } catch (e) {
            return null;
        }
    }

    function setUser(user) {
        if (user) {
            localStorage.setItem(USER_KEY, JSON.stringify(user));
        } else {
            localStorage.removeItem(USER_KEY);
        }
    }

    function isLoggedIn() {
        return !!getToken();
    }

    function isAdmin() {
        const u = getUser();
        return !!(u && u.role === "admin");
    }

    function logout() {
        setToken("");
        setUser(null);
        localStorage.removeItem("annProfile");
        sessionStorage.clear();
    }

    /* ---------------- REQUEST CORE ---------------- */

    async function request(path, options) {
        const opts = options || {};
        const method = (opts.method || "GET").toUpperCase();
        const body = opts.body;
        const useAuth = opts.auth !== false;
        const redirectOnAuthError = opts.redirectOnAuthError !== false;

        const headers = Object.assign({}, opts.headers || {});
        const isFormData = typeof FormData !== "undefined" && body instanceof FormData;
        if (body !== undefined && !isFormData) headers["Content-Type"] = "application/json";
        if (useAuth && getToken()) headers["Authorization"] = "Bearer " + getToken();

        let response;
        try {
            response = await fetch(API_BASE + path, {
                method: method,
                headers: headers,
                body: body !== undefined ? (isFormData ? body : JSON.stringify(body)) : undefined,
            });
        } catch (e) {
            const err = new Error("Unable to reach the server. Please check your connection.");
            err.status = 0;
            err.isNetwork = true;
            throw err;
        }

        let data = null;
        try {
            data = await response.json();
        } catch (e) {
            data = {};
        }

        if (response.status === 401 && useAuth && getToken()) {
            if (redirectOnAuthError) {
                logout();
                window.location.href = "login.html";
            }
        }

        if (!response.ok) {
            const err = new Error((data && data.message) || "Something went wrong.");
            err.status = response.status;
            err.data = data;
            throw err;
        }

        return data;
    }

    /* ---------------- PUBLIC HELPERS ---------------- */

    function apiUrl(path) {
        return API_BASE + path;
    }

    async function get(path, opts) {
        return request(path, Object.assign({ method: "GET" }, opts));
    }

    async function post(path, data, opts) {
        return request(path, Object.assign({ method: "POST", body: data }, opts));
    }

    async function put(path, data, opts) {
        return request(path, Object.assign({ method: "PUT", body: data }, opts));
    }

    async function del(path, opts) {
        return request(path, Object.assign({ method: "DELETE" }, opts));
    }

    return {
        API_BASE: API_BASE,
        apiUrl: apiUrl,
        request: request,
        get: get,
        post: post,
        put: put,
        del: del,
        getToken: getToken,
        setToken: setToken,
        getUser: getUser,
        setUser: setUser,
        isLoggedIn: isLoggedIn,
        isAdmin: isAdmin,
        logout: logout,
    };

})();