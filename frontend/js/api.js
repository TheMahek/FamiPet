/* =========================================================
   FAMIPET - API CLIENT (Integration Layer)
   Handles auth token, headers, and backend communication.
   ========================================================= */

const FamiPetAPI = (function () {

    // Load the deploy-time API configuration file (frontend/js/config.js) if it
    // has not been included by the page. It sets window.__FAMIPET_CONFIG__ with
    // the public backend URL for production. Synchronous injection only happens
    // when the file exists; local development without it keeps the old fallback.
    if (!window.__FAMIPET_CONFIG__ && !window.FamiPetConfig) {
        try {
            var cur = (function () {
                var s = document.getElementsByTagName('script');
                for (var i = s.length - 1; i >= 0; i--) {
                    if (/js\/api\.js$/i.test(s[i].src || '')) return s[i].src;
                }
                return '';
            })();
            if (cur) {
                var dir = cur.replace(/[^\/]*$/, '');
                document.write('<script src="' + dir + 'config.js"><\/script>');
            }
        } catch (e) { /* keep dev fallback */ }
    }

    // API base resolution, evaluated lazily on EVERY request:
    //   1. window.__FAMIPET_CONFIG__.API_BASE  – set by frontend/js/config.js
    //      to the PUBLIC backend URL (production) or the same-origin "/api"
    //      (served through the nginx reverse proxy / future Cloudflare HTTPS).
    //      config.js is loaded
    //      asynchronously via document.write above, so reading it eagerly at
    //      parse time can grab the value BEFORE config.js ran and wrongly fall
    //      back to the local dev URL. Lazy resolution fixes that: by the time
    //      any request fires, config.js has executed and its value wins.
    //   2. window.FAMIPET_API_BASE             – per-page inline override (dev/testing).
    //   3. Development fallback                 – same host, port 5000. ONLY used when
    //      running locally; production deploys MUST provide FamiPetConfig.
    // The page's own host is never used in production because frontend and
    // backend live on different public domains (and never on localhost/192.168.x).
    const getApiBase = function () {
        const prodConfig = (window.__FAMIPET_CONFIG__ && window.__FAMIPET_CONFIG__.API_BASE) || (window.FamiPetConfig && window.FamiPetConfig.API_BASE) || '';
        if (prodConfig) {
            return String(prodConfig).replace(/\/+$/, '');
        }
        if (window.FAMIPET_API_BASE) return window.FAMIPET_API_BASE;
        const proto = window.location.protocol;
        const host = window.location.hostname;
        return proto + "//" + host + ":5000/api";
    };
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
            response = await fetch(getApiBase() + path, {
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
        return getApiBase() + path;
    }

    /* ---------------- AVATAR HELPERS ---------------- */

    // The legacy default profile SVG is a placeholder, not a real photo.
    const AVATAR_PLACEHOLDER = "user-profile.svg";

    function isRealAvatar(value) {
        return typeof value === "string" &&
            value.trim() !== "" &&
            !value.includes(AVATAR_PLACEHOLDER);
    }

    // Turn whatever the backend stored for the avatar into a URL the browser
    // can load: uploaded files are served from the API origin ("/uploads/..."),
    // while data URLs, blob URLs and absolute/CDN URLs pass straight through.
    // Returns "" when the user has no real photo so callers can show the
    // initials empty state instead of another user's image.
    function resolveAvatarUrl(value) {
        if (!isRealAvatar(value)) return "";
        const src = String(value).trim();
        if (/^(?:data:|blob:|https?:|\/\/)/i.test(src)) return src;
        if (/^\.{1,2}\//.test(src)) return src;
        let origin = "";
        try {
            origin = String(getApiBase()).replace(/\/api\/?$/i, "");
        } catch (e) {
            origin = "";
        }
        return origin + "/" + src.replace(/^\.?\//, "");
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
        get API_BASE() {
            return getApiBase();
        },
        getApiBase: getApiBase,
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
        isRealAvatar: isRealAvatar,
        resolveAvatarUrl: resolveAvatarUrl,
    };

})();