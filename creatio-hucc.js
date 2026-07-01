// ============================================================
// HUCC → Creatio connector — version test
// ============================================================

var CREATIO_BASE_URL = "https://hucc-proxy.onrender.com";
var CREATIO_LOGIN    = "Administrator 1";      // ← à remplacer
var CREATIO_PASSWORD = "ProcessFirst1*";   // ← à remplacer

// Token CSRF Creatio (rempli après login)
var bpmcsrfToken = null;

// Contact identifié pendant l'appel en cours
var currentCallContactId = null;
var currentCallerNumber  = null;

// ============================================================
// UTILITAIRE : headers pour les requêtes Creatio
// ============================================================
function creatioHeaders(includeCSRF) {
    var headers = {
        "Content-Type": "application/json",
        "Accept": "application/json"
    };
    if (includeCSRF && bpmcsrfToken) {
        headers["BPMCSRF"] = bpmcsrfToken;
    }
    return headers;
}

// ============================================================
// 1. LOGIN CREATIO
// ============================================================
function loginCreatio() {
    console.log("CREATIO-HUCC : try connect loginCreatio");
    return fetch(CREATIO_BASE_URL + "/ServiceModel/AuthService.svc/Login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
            UserName: CREATIO_LOGIN,
            UserPassword: CREATIO_PASSWORD
        })
    })
    .then(function(res) { return res.json(); })
    .then(function(data) {
        if (data.Code === 0) {
            bpmcsrfToken = data.BPMCSRF;
            console.log("CREATIO : login OK, BPMCSRF =", bpmcsrfToken);
            return true;
        } else {
            console.error("CREATIO : login échoué, code =", data.Code);
            return false;
        }
    })
    .catch(function(err) {
        console.error("CREATIO : erreur login", err);
        return false;
    });
}

// ============================================================
// 2. FETCH AVEC RETRY AUTO SI 401
// ============================================================
function fetchWithRetry(url, options) {
    return fetch(url, options)
        .then(function(res) {
            if (res.status === 401) {
                console.log("CREATIO : session expirée (401), re-login en cours...");
                return loginCreatio().then(function(ok) {
                    if (ok) {
                        // Mettre à jour le BPMCSRF dans les headers si nécessaire
                        if (options.headers && options.headers["BPMCSRF"]) {
                            options.headers["BPMCSRF"] = bpmcsrfToken;
                        }
                        console.log("CREATIO : re-login OK, rejoue la requête");
                        return fetch(url, options);
                    }
                    return res;
                });
            }
            return res;
        });
}

// ============================================================
// 3. CHERCHER UN CONTACT PAR NUMÉRO DE TÉLÉPHONE
// ============================================================
function searchContactByPhone(phoneNumber) {
    var phoneClean = phoneNumber.replace(/\s/g, "");
    var phoneLocal = phoneClean.replace(/^\+33/, "0");

    var filter = encodeURIComponent(
        "contains(Phone, '" + phoneClean + "')" +
        " or contains(MobilePhone, '" + phoneClean + "')" +
        " or contains(Phone, '" + phoneLocal + "')" +
        " or contains(MobilePhone, '" + phoneLocal + "')"
    );

    var url = CREATIO_BASE_URL + "/0/odata/Contact?$select=Id,Name,Phone,MobilePhone&$filter=" + filter;
    console.log("CREATIO : recherche contact pour", phoneNumber);

    return fetchWithRetry(url, {
        method: "GET",
        headers: creatioHeaders(false),
        credentials: "include"
    })
    .then(function(res) {
        if (!res.ok) {
            console.error("CREATIO : erreur recherche", res.status);
            return [];
        }
        return res.json();
    })
    .then(function(data) {
        var contacts = data.value || [];
        console.log("CREATIO : " + contacts.length + " contact(s) trouvé(s)", contacts);

        return contacts.map(function(c) {
            return {
                objectId:    c.Id,
                objectType:  "contact",
                description: c.Name + " (" + (c.Phone || c.MobilePhone) + ")"
            };
        });
    })
    .catch(function(err) {
        console.error("CREATIO : erreur fetch recherche", err);
        return [];
    });
}

// ============================================================
// 4. CRÉER UNE ACTIVITÉ "APPEL" DANS CREATIO
// ============================================================
function createCallActivity(callerNumber, contactId) {
    var data = {
        "Title": "Appel entrant - " + callerNumber,
        "TypeId": "e1c59272-5001-4d72-8f62-a4dc6e91f345",
        "PhoneNumber": callerNumber,
        "StartDate": new Date().toISOString(),
        "StatusId": "384d4ef6-55d6-df11-971b-001d60e938c6"
    };

    if (contactId) {
        data["ContactId"] = contactId;
    }

    console.log("CREATIO : création activité →", data);

    return fetchWithRetry(CREATIO_BASE_URL + "/0/odata/Activity", {
        method: "POST",
        headers: creatioHeaders(true),
        credentials: "include",
        body: JSON.stringify(data)
    })
    .then(function(res) {
        if (res.ok) {
            return res.json().then(function(d) {
                console.log("CREATIO : activité créée →", d.Id);
                return d.Id;
            });
        } else {
            console.error("CREATIO : erreur création activité", res.status);
            return null;
        }
    })
    .catch(function(err) {
        console.error("CREATIO : erreur fetch création activité", err);
        return null;
    });
}

// ============================================================
// 5. OUVRIR LA FICHE CONTACT DANS CREATIO (nouvel onglet)
// ============================================================
function openContactInCreatio(objectId, objectType) {
    var url = "https://nds-pf1-demo.creatio.com/0/Nui/ViewModule.aspx#" + objectType + "/edit/" + objectId;
    console.log("CREATIO : ouverture fiche →", url);
    window.open(url, "_blank");
}

// ============================================================
// 6. GARDER LE PROXY ÉVEILLÉ (ping toutes les 5 minutes)
// ============================================================
function startPing() {
    setInterval(function() {
        fetch(CREATIO_BASE_URL + "/ping", { credentials: "include" })
            .then(function(res) { return res.json(); })
            .then(function(data) {
                console.log("CREATIO : ping proxy →", data.status, "| session:", data.session);
                // Si la session est perdue côté proxy, on se reconnecte
                if (data.session === "NON") {
                    console.log("CREATIO : session proxy perdue, re-login...");
                    loginCreatio();
                }
            })
            .catch(function() {
                console.warn("CREATIO : proxy injoignable, tentative de re-login...");
                loginCreatio();
            });
    }, 4 * 60 * 1000); // toutes les 4 minutes
}

// ============================================================
// 7. HANDLERS HUCC
// ============================================================
function initHUCC() {
    console.log("CREATIO-HUCC : UCCore prêt, initialisation des handlers");

    // Login au démarrage puis ping régulier
    loginCreatio().then(function() {
        startPing();
    });

    // ── Appel entrant : chercher le contact ──────────────────
    Vocalcom.UCCore.addHandler("OnSearchForCaller", function(phoneNumber) {
        console.log("CREATIO-HUCC : OnSearchForCaller →", phoneNumber.E164);
        currentCallerNumber  = phoneNumber.E164;
        currentCallContactId = null;

        searchContactByPhone(phoneNumber.E164)
            .then(function(results) {
                console.log("CREATIO-HUCC : résultats →", results);
                Vocalcom.UCCore.emitCallerSearchResult(results);

                if (results.length === 1) {
                    currentCallContactId = results[0].objectId;
                    openContactInCreatio(results[0].objectId, results[0].objectType);
                }
            });
    });

    // ── L'agent clique sur un résultat dans la toolbar ───────
    Vocalcom.UCCore.addHandler("OnOpenCRMObject", function(objectId, objectType) {
        console.log("CREATIO-HUCC : OnOpenCRMObject →", objectId, objectType);
        currentCallContactId = objectId;
        openContactInCreatio(objectId, objectType || "contact");
    });

    // ── Agent a décroché ─────────────────────────────────────
    Vocalcom.UCCore.addHandler("OnCallOnline", function() {
        console.log("CREATIO-HUCC : OnCallOnline → appel en cours");
    });

    // ── Appel terminé : créer l'activité ─────────────────────
    Vocalcom.UCCore.addHandler("OnCallFree", function() {
        console.log("CREATIO-HUCC : OnCallFree → création activité");
        createCallActivity(currentCallerNumber, currentCallContactId);
    });
}

// ============================================================
// 8. DÉMARRAGE
// ============================================================
console.log("CREATIO-HUCC : fichier chargé");

if (window.Vocalcom && window.Vocalcom.UCCore) {
    initHUCC();
} else {
    window.addEventListener("VCUCCoreLoadDone", initHUCC);
}