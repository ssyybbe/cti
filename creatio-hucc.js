window.addEventListener("VCUCCoreLoadDone", () => {

    // 1. Appel entrant → chercher le contact dans Creatio
    Vocalcom.UCCore.addHandler("OnSearchForCaller", function(phoneNumber) {
        console.log("aaaaaa");
        console.log(phoneNumber);
        console.log(phoneNumber.E164);
        console.log("aaaaaa");
        //searchContactInCreatio(phoneNumber.E164).then(results => Vocalcom.UCCore.emitCallerSearchResult(results));
    });

    // 2. Résultats prêts → ouvrir la fiche si un seul résultat
/*    Vocalcom.UCCore.addHandler("OnCallerSearchResult", function(results) {
        console.log("bbbb");
        console.log(results);
        if (results.length === 1) {
            console.log(results[0]);
            console.log("bbbbbb");
            //navigateToCreatioRecord(results[0].objectId, results[0].objectType);
        }
    });

    // 3. Appel terminé → logger dans Creatio
    Vocalcom.UCCore.addHandler("OnCallFree", function() {
        console.log("yoo");
        //logCallInCreatio();
    });

    // 4. Agent qualifie l'appel → sauvegarder dans Creatio
    Vocalcom.UCCore.addHandler("OnSetCallDisposition", function(callStatusData) {
        console.log("cccccc");
        console.log(callStatusData);
        console.log("cccccc");
        //saveDispositionInCreatio(callStatusData);
    });
*/
});
