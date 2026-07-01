console.log("CREATIO-HUCC : fichier chargé");

function initHUCC() {
    console.log("CREATIO-HUCC : UCCore prêt");

    Vocalcom.UCCore.addHandler("OnSearchForCaller", function(phoneNumber) {
        console.log("CREATIO-HUCC : appel entrant de", phoneNumber.E164);
        // TODO : chercher dans Creatio
    });

    Vocalcom.UCCore.addHandler("OnCallOnline", function() {
        console.log("CREATIO-HUCC : agent a décroché");
    });

    Vocalcom.UCCore.addHandler("OnCallFree", function() {
        console.log("CREATIO-HUCC : appel terminé");
    });
}

if (window.Vocalcom && window.Vocalcom.UCCore) {
    initHUCC();
} else {
    window.addEventListener("VCUCCoreLoadDone", initHUCC);
}