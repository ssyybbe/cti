// ============================================================
// HUCC → Creatio connector — via proxy serveur (anti-CORS)
// ============================================================
// Ce script n'appelle plus jamais Creatio directement en GET/POST
// (ce qui causait les erreurs CORS). Il passe par un petit serveur
// proxy (voir dossier creatio-proxy/) qui, lui, parle à Creatio
// en server-to-server.
//
// La seule interaction directe avec Creatio ici est window.open()
// pour afficher la fiche contact — ce n'est pas un appel réseau
// JS (fetch/XHR), donc aucun souci de CORS.
// ============================================================

var PROXY_BASE_URL   = "https://votre-proxy.example.com"; // ← URL de VOTRE serveur proxy
var CREATIO_BASE_URL = "https://stlia-demo.creatio.com";   // utilisé uniquement pour ouvrir les fiches

// ============================================================
// 1. CHERCHER UN CONTACT PAR NUMÉRO DE TÉLÉPHONE (via proxy)
// ============================================================
function searchContactByPhone(phoneNumber) {
    var url = PROXY_BASE_URL + "/api/contacts/search?phone=" + encodeURIComponent(phoneNumber);
    console.log("CREATIO-HUCC : recherche contact (via proxy) pour", phoneNumber);
    return fetch(url, { method: "GET" })
        .then(function(res) {
            if (!res.ok) {
                console.error("PROXY : erreur recherche", res.status);
                return [];
            }
            return res.json();
        })
        .then(function(contacts) {
            console.log("PROXY : " + contacts.length + " contact(s) trouvé(s)", contacts);
            return contacts;
        })
        .catch(function(err) {
            console.error("PROXY : erreur fetch recherche", err);
            return [];
        });
}

// ============================================================
// 2. CRÉER UNE ACTIVITÉ "APPEL" DANS CREATIO (via proxy)
// ============================================================
function createCallActivity(callerNumber, contactId) {
    return fetch(PROXY_BASE_URL + "/api/activities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ callerNumber: callerNumber, contactId: contactId })
    })
    .then(function(res) {
        if (res.ok) {
            return res.json().then(function(d) {
                console.log("PROXY : activité créée →", d.id);
                return d.id;
            });
        } else {
            console.error("PROXY : erreur création activité", res.status);
            return null;
        }
    })
    .catch(function(err) {
        console.error("PROXY : erreur fetch création activité", err);
        return null;
    });
}

// ============================================================
// 3. OUVRIR LA FICHE CONTACT DANS CREATIO (nouvel onglet)
// ============================================================
// Pas d'appel réseau JS ici : c'est une simple navigation du
// navigateur, donc pas de CORS. L'agent doit être connecté à
// Creatio dans son propre onglet pour voir la fiche.
// Correspondance entre le type d'objet (utilisé en interne par le widget)
// et le nom de la page de fiche Creatio (Shell). À compléter si vous
// ouvrez d'autres types d'objets (compte, opportunité, etc.).
var CREATIO_FORM_PAGES = {
    "contact": "Contacts_FormPage"
    // "account": "Accounts_FormPage",
    // "opportunity": "Opportunity_FormPage",
};

function openContactInCreatio(objectId, objectType) {
    var formPage = CREATIO_FORM_PAGES[objectType] || CREATIO_FORM_PAGES["contact"];
    var url = CREATIO_BASE_URL + "/0/Shell/#Card/" + formPage + "/edit/" + objectId;
    console.log("CREATIO : ouverture fiche →", url);
    window.open(url, "_blank");
}

// ============================================================
// 4. INITIALISATION DES HANDLERS HUCC
// ============================================================
var currentCallContactId = null;
var currentCallerNumber  = null;

function initHUCC() {
    console.log("CREATIO-HUCC : UCCore prêt, initialisation des handlers");

    // ── Appel entrant : chercher le contact ──────────────────
    Vocalcom.UCCore.addHandler("OnSearchForCaller", function(phoneNumber) {
        console.log("CREATIO-HUCC : OnSearchForCaller →", phoneNumber.E164);
        currentCallerNumber  = phoneNumber.E164;
        currentCallContactId = null;

        searchContactByPhone(phoneNumber.E164)
            .then(function(results) {
                console.log("CREATIO-HUCC : résultats envoyés à HUCC →", results);
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

    // ── Appel terminé : créer l'activité dans Creatio ────────
    Vocalcom.UCCore.addHandler("OnCallFree", function() {
        console.log("CREATIO-HUCC : OnCallFree → création activité");
        createCallActivity(currentCallerNumber, currentCallContactId);
    });
}

// ============================================================
// 5. DÉMARRAGE
// ============================================================
console.log("CREATIO-HUCC : fichier chargé");
if (window.Vocalcom && window.Vocalcom.UCCore) {
    initHUCC();
} else {
    window.addEventListener("VCUCCoreLoadDone", initHUCC);
}
