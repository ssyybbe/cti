// ============================================================
// HUCC → Creatio connector — version test
// ============================================================

var CREATIO_BASE_URL = "https://hucc-proxy.onrender.com";
var CREATIO_LOGIN    = "Administrator 1";      // ← à remplacer
var CREATIO_PASSWORD = "ProcessFirst1*";   // ← à remplacer

// Token CSRF Creatio (rempli après login)
var bpmcsrfToken = null;

// ============================================================
// UTILITAIRE : lire un cookie par son nom
// ============================================================
function getCookie(name) {
    var match = document.cookie.match(new RegExp("(^| )" + name + "=([^;]+)"));
    return match ? match[2] : null;
}

// ============================================================
// UTILITAIRE : construire les headers pour les requêtes Creatio
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
    console.log("try connect loginCreatio");
    return fetch(CREATIO_BASE_URL + "/ServiceModel/AuthService.svc/Login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
            UserName: CREATIO_LOGIN,
            UserPassword: CREATIO_PASSWORD
        })
    })
    .then(function(res) {
        if (res.ok) {
            // Récupérer le token CSRF depuis les cookies
            bpmcsrfToken = getCookie("BPMCSRF");
            console.log("CREATIO : login OK, BPMCSRF =", bpmcsrfToken);
            return true;
        } else {
            console.error("CREATIO : login échoué", res.status);
            return false;
        }
    })
    .catch(function(err) {
        console.error("CREATIO : erreur login (probablement CORS)", err);
        return false;
    });
    console.log("try connect loginCreatio end");
}

// ============================================================
// 2. CHERCHER UN CONTACT PAR NUMÉRO DE TÉLÉPHONE
// ============================================================
function searchContactByPhone(phoneNumber) {
    console.log("CREATIO : recherche contact pour", phoneNumber);


    // On nettoie le numéro : on cherche avec et sans +33
    var phoneClean = phoneNumber.replace(/\s/g, "");
    var phoneLocal = phoneClean.replace(/^\+33/, "0");

    var filter = encodeURIComponent(
        "contains(Phone, '" + phoneClean + "')" +
        " or contains(MobilePhone, '" + phoneClean + "')" +
        " or contains(Phone, '" + phoneLocal + "')" +
        " or contains(MobilePhone, '" + phoneLocal + "')"
    );

    var url = CREATIO_BASE_URL + "/0/odata/Contact?$select=Id,Name,Phone,MobilePhone&$filter=" + filter;


    return fetch(url, {
        method: "GET",
        headers: creatioHeaders(false), // GET : pas besoin du CSRF
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

        // Convertir au format HUCC
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
// 3. CRÉER UNE ACTIVITÉ "APPEL" DANS CREATIO
// ============================================================
function createCallActivity(callerNumber, contactId) {
    var data = {
        "Title": "Appel entrant - " + callerNumber,
        "TypeId": "e1c59272-5001-4d72-8f62-a4dc6e91f345", // GUID type "Appel" dans Creatio
        "PhoneNumber": callerNumber,
        "StartDate": new Date().toISOString(),
        "StatusId": "384d4ef6-55d6-df11-971b-001d60e938c6"  // Statut "Terminé"
    };

    // Lier au contact si trouvé
    if (contactId) {
        data["ContactId"] = contactId;
    }

    return fetch(CREATIO_BASE_URL + "/0/odata/Activity", {
        method: "POST",
        headers: creatioHeaders(true), // POST : CSRF obligatoire
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
// 4. OUVRIR LA FICHE CONTACT DANS CREATIO (nouvel onglet)
// ============================================================
function openContactInCreatio(objectId, objectType) {
    var url = CREATIO_BASE_URL + "/0/Nui/ViewModule.aspx#" + objectType + "/edit/" + objectId;
    console.log("CREATIO : ouverture fiche →", url);
    window.open(url, "_blank");
}

// ============================================================
// 5. INITIALISATION DES HANDLERS HUCC
// ============================================================

// Stockage temporaire du contact identifié pendant l'appel
var currentCallContactId = null;
var currentCallerNumber  = null;

function initHUCC() {
    console.log("CREATIO-HUCC : UCCore prêt, initialisation des handlers");

    // Login Creatio au démarrage
    loginCreatio();

    // ── Appel entrant : chercher le contact ──────────────────
    Vocalcom.UCCore.addHandler("OnSearchForCaller", function(phoneNumber) {
        console.log("CREATIO-HUCC : OnSearchForCaller →", phoneNumber.E164);
        currentCallerNumber  = phoneNumber.E164;
        currentCallContactId = null;

        searchContactByPhone(phoneNumber.E164)
            .then(function(results) {
                console.log("CREATIO-HUCC : résultats envoyés à HUCC →", results);
                Vocalcom.UCCore.emitCallerSearchResult(results);

                // Si un seul contact trouvé : mémoriser et ouvrir sa fiche
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

    // ── Appel terminé : créer l'activité dans Creatio ────────
    Vocalcom.UCCore.addHandler("OnCallFree", function() {
        console.log("CREATIO-HUCC : OnCallFree → création activité");
        createCallActivity(currentCallerNumber, currentCallContactId);
    });
}

// ============================================================
// 6. DÉMARRAGE
// ============================================================
console.log("CREATIO-HUCC : fichier chargé");

if (window.Vocalcom && window.Vocalcom.UCCore) {
    initHUCC();
} else {
    window.addEventListener("VCUCCoreLoadDone", initHUCC);
}