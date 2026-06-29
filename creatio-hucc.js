window.addEventListener("VCUCCoreLoadDone", () => {
    // Pour afficher "ça sonne" dans votre UI
    Vocalcom.UCCore.addHandler("OnInboundCallRinging", function() {
        var context = Vocalcom.UCCore.getGlobalContext();
        console.log("Appel entrant de", context.callInfo.caller);

    });


    Vocalcom.UCCore.addHandler("OnSearchForCaller", function(phoneNumber) {
        console.log("OnSearchForCaller begin : ");
        console.log(phoneNumber);
        console.log(phoneNumber.E164);
        console.log("OnSearchForCaller end : ");
    });
});
 