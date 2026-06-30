(function () {
    var Memo = "";
    var Tel = "";
    var associateData = "";
    var campaignId = "";
    var campaignName = "";
    var sessionId = "";
    var CRMPhoneCallId = null;
    var callType = "";
    var currentDisplayMode;

    //multiple request control flags    
    var searchingCaller = false;
    var fromClicktoCall = false;

    //Temp resulsets
    var tempAccounts = [];
    var tempContacts = [];
    var tempLeads = [];

    // callers storage
    var context_tmp = Vocalcom.UCCore.getGlobalContext();
    var callers = context_tmp.callInfo?.searchCallerResult || [];

    var clickToDialCallbackEvt = null;

    var DisplayMode = Object.freeze({
        Minimized: 0,   //XrmClientApi.Constants.PanelState.Collapsed
        Docked: 1       //XrmClientApi.Constants.PanelState.Expanded
    });

    // set crm objects 
    Vocalcom.UCCore.setCRMObjects([{
        objectType: 'contact',
        description: 'Contact'
    },
    {
        objectType: 'account',
        description: 'Account'
    },
    {
        objectType: 'lead',
        description: 'Lead'
    }
    ]);

    var panel_width = 400;
    Microsoft.CIFramework.getWidth().then(
        (width) => {
            if (width < panel_width) {
                Microsoft.CIFramework.setWidth(panel_width);
            }
        },
        (error) => {
            Microsoft.CIFramework.setWidth(panel_width);
            console.error(error);
        }
    );

    var PhoneCallData = function () {
        ///We need to define contact/account/lead id
        //We need to define caller


        let data = {
            "createdby_phonecall@odata.bind": "",
            "subject": "",
            //"regardingobjectid_contact@odata.bind": "",
            "directioncode": "",
            "phonenumber": "",
            "description": "",
            "ownerid_phonecall@OData.Community.Display.V1.FormattedValue": "",
            "ownerid_phonecall@odata.bind": "",
            "phonecall_activity_parties": [
                {
                    //"partyid_contact@odata.bind": "",
                    "participationtypemask": 2
                },
                {
                    "partyid_systemuser@odata.bind": "",
                    "participationtypemask": 1
                }
            ],
            "huuc_hermes_callid": "",
            "huuc_hermes_campaign_name": "",
            "huuc_hermes_datamemo": "",
            "huuc_hermes_associated": "",
            "huuc_hermes_call_indice": "",
            "huuc_hermes_call_starttime": "",
            "huuc_hermes_call_stoptime": ""
        }

        var context = Vocalcom.UCCore.getGlobalContext()
        let caller = context.callInfo?.caller;
        if (!caller || caller == "") {
            console.debug("[MSDynamicsCRM] There is no caller number");
        }

        let numberOfcallers = callers.length;
        if (numberOfcallers == 0) {
            console.error("[MSDynamicsCRM] Could not create phonedata without a contactId");
            return;
        }
        else {
            console.debug("[MSDynamicsCRM] ðŸ˜„ User identified ðŸ˜„");
            let entity = callers[0];


            if (entity.objectType == "contact") {
                data["regardingobjectid_contact@odata.bind"] = "/contacts(" + entity.objectId + ")";
                data.phonecall_activity_parties[0]["partyid_contact@odata.bind"] = "/contacts(" + entity.objectId + ")";
            }
            else if (entity.objectType == "account") {
                data["regardingobjectid_account@odata.bind"] = "/accounts(" + entity.objectId + ")";
                data.phonecall_activity_parties[0]["partyid_account@odata.bind"] = "/accounts(" + entity.objectId + ")";
            } else if (entity.objectType == "lead") {
                data["regardingobjectid_lead@odata.bind"] = "/leads(" + entity.objectId + ")";
                data.phonecall_activity_parties[0]["partyid_lead@odata.bind"] = "/leads(" + entity.objectId + ")";
            }
        }

        var calltype = context.callInfo?.callType;
        var redial = context.callInfo?.redial;

        //System user (dynamic user)
        data["createdby_phonecall@odata.bind"] = "/systemusers(" + localStorage.getItem('USERID').toLocaleLowerCase() + ")";
        data["ownerid_phonecall@odata.bind"] = "/systemusers(" + localStorage.getItem('USERID').toLocaleLowerCase() + ")";
        data["ownerid_phonecall@OData.Community.Display.V1.FormattedValue"] = localStorage.getItem('USERNAME');



        if (calltype == "outbound") {
            data.phonecall_activity_parties[0].participationtypemask = 2;
            data.phonecall_activity_parties[1].participationtypemask = 1;
            data.directioncode = "true";
        }
        else {
            data.phonecall_activity_parties[0].participationtypemask = 1;
            data.phonecall_activity_parties[1].participationtypemask = 2;
            data.directioncode = "false";
        }

        data.phonecall_activity_parties[1]["partyid_systemuser@odata.bind"] = "/systemusers(" + localStorage.getItem('USERID').toLocaleLowerCase() + ")";


        if (calltype == "outbound" && Number(context.callInfo.compaignType) === 0) {
            calltype = "Manual";
        }

        if (calltype == "inbound" && redial) {
            calltype = "Inbound redial";
        }
        else if (redial) {
            calltype = "Redial";
        }

        data.subject = calltype;
        data.phonenumber = caller;

        data.huuc_hermes_callid = context.callInfo?.sessionId;
        data.huuc_hermes_campaign_name = context.callInfo?.campaignName;
        data.huuc_hermes_datamemo = context.callInfo?.memo;
        data.huuc_hermes_associated = context.callInfo?.associateData;
        data.huuc_hermes_call_indice = context.callInfo?.indice?.toString();
        var callStartTime = Vocalcom.UCCore.Telephony.getFirstCallStartTime();
        var callEndTime = Vocalcom.UCCore.Telephony.getFirstCallEndTime();

        if (callStartTime) { data.huuc_hermes_call_starttime = callStartTime.toString(); }
        if (callEndTime) { data.huuc_hermes_call_stoptime = callEndTime.toString(); }

        console.debug("[MSDynamicsCRM] ðŸ’ðŸ’", data);
        return data;
    };

    /**
     * Open new form in Dynamics
     * @param {object} entityFormOptions 
     * @param {object} formParameters 
     * @returns {Promise<Object>}
     */
    var openForm = function (entityFormOptions, formParameters) {
        return Microsoft.CIFramework.openForm(JSON.stringify(entityFormOptions), JSON.stringify(formParameters));
    };

    /**
     * Create new record in Dynamics
     * @param {object} entityLogicalName Logical name of the entity you want to create
     * @param {object} jsonData String defining the attributes and values for the new entity record
     * @returns {Promise<object>} 
     */
    var createRecord = function (entityLogicalName, jsonData) {
        return Microsoft.CIFramework.createRecord(entityLogicalName, JSON.stringify(jsonData));
    };

    /* Our handler invoked by CIF when the user changes panel mode */
    function modeChangedHandler(paramStr) {
        return new Promise(function (resolve, reject) {
            try {
                let params = JSON.parse(paramStr);
                var mode = currentDisplayMode = params["value"];
                console.log("Mode changed to " + mode);
                //Get the new mode from the parameters passed by CIF and update our state accordingly
                if (mode == DisplayMode.Docked) {
                    expandPanel();
                }
                else {
                    collapsePanel();
                }
                resolve(true);
            }
            catch (error) {
                reject(error);
            }
        });
    }

    var expandPanel = function () {
        Vocalcom.UCCore.expand();
    };

    /* Hide the toast area; only display sidebar area */
    var collapsePanel = function () {
        Vocalcom.UCCore.collapse();
    };

    function panelSizeChangedHandler(eventData) {
        console.log("panelSizeChangedHandler", eventData);
        let jsEventData = JSON.parse(eventData);
        if (jsEventData.value < panel_width) {
            Microsoft.CIFramework.setWidth(panel_width);
        }
        return Promise.resolve();
    }

    Microsoft.CIFramework.addHandler("onmodechanged", modeChangedHandler);
    Microsoft.CIFramework.addHandler("onsizechanged", panelSizeChangedHandler);

    /**
    * 
    * @param {string} paramStr 
    * @returns 
    */
    var clickToActHandler = function (paramStr) {
        return new Promise(function (resolve, reject) {
            try {
                let params = JSON.parse(paramStr);
                var phNo = params.value;   //Retrieve the phone number to dial from parameters passed by CIF
                console.log("[MSDynamicsCRM] Click To call!", params);

                fromClicktoCall = true;
                callers = [];
                callers.push({ objectId: params.entityId, objectType: params.entityLogicalName, description: params.recordTitle, phone: params.value })

                clickToDialCallbackEvt({ number: phNo });
                resolve(true);
            }
            catch (error) {
                reject(error);
            }
        });
    };

    /**
     * updatePhoneCall
     * @param {*} data 
     */
    var updatePhoneCall = function (data) {
        if (!Vocalcom.UCCore.isMaster()) {
            console.debug("[MSDynamicsCRM] Not Master can't update a phone call");
            return;
        }
        var entityLogicalName = "phonecall";
        CRMPhoneCallId = localStorage.getItem('phoneCallId');
        if (CRMPhoneCallId) {
            var id = CRMPhoneCallId;

            var jsonData = JSON.stringify(data);
            Microsoft.CIFramework.updateRecord(entityLogicalName, id, jsonData).then(
                function success(result) {
                    res = JSON.parse(result);
                    console.debug("[MSDynamicsCRM] Phonecall updated with ID: " + res.id);
                    //the record is updated
                },
                function (error) {
                    console.error("[MSDynamicsCRM] Error updating phonecall: ", error);
                    //handle error conditions
                }
            );
        }
        else { console.debug("[MSDynamicsCRM] No phonecall to update "); }
    };

    /**
     * Implements Microsoft.CIFramework.searchAndOpenRecords
     * @param {string} value Caller or query to be made
     * @param {string} param Field we want to search, empty if we want use a query
     * @param {string} entity Name of the entity to search and open
     * @param {boolean} searchOnly Open or not the record on Dynamics
     * @param {Array<string>} properties Select fields we want
     * @param {boolean} search Define if we will search the value
     * @returns {Promise<object>} Returns data entity
     */
    var searchAndOpenRecords = function (
        value = '',
        param = 'mobilephone',
        entity = 'contact',
        searchOnly = false,
        properties = ['firstname', 'lastname', 'fullname', 'contactid', 'mobilephone', 'ownerid'],
        search = true
    ) {
        if (param === 'mobilephone' || param === 'telephone1') {
            data = [];
            if (typeof value === 'object' && value !== null) {
                var national = value.National;
                if (national) {
                    data.push(`contains(${param}, '${national}')`);
                    data.push(`contains(${param}, '${national.replace(/[^0-9]/g, '')}')`);
                }
                var E164 = value.E164;
                if (E164) {
                    data.push(`contains(${param}, '${E164}')`);
                    data.push(`contains(${param}, '${E164.replace(/[^0-9]/g, '')}')`);
                }
            }
        } else {
            data = [`${param} eq '${value}'`];
        }
        let query = (param !== '') ? '?$select=' + properties.join(',') + '&$filter=' + data.join(' or ') + ((search) ? ('&$search=*' + ((param === 'mobilephone') ? value.substring(2) : value) + '*') : '') : value;
        console.debug('[MSDynamicsCRM] searchAndOpenRecords', { query });
        return Microsoft.CIFramework.searchAndOpenRecords(entity, query, searchOnly);
    };

    /**
     * save account result
     * @param {string} entities 
     */
    var accountToCallers = function (entities) {
        let val = JSON.parse(entities);
        console.debug('[MSDynamicsCRM] Accounts as Array', Object.values(val));

        Object.entries(val).forEach(item => {
            callers.push({ objectId: item[1]?.accountid, objectType: "account", description: item[1]?.name, phone: item[1]?.telephone1 })
        });
    };

    /**
     * save contacts result
     * @param {string} entities 
     */
    var contactToCallers = function (entities) {
        let val = JSON.parse(entities);
        console.debug('[MSDynamicsCRM] Contacts as Array', Object.values(val));

        Object.entries(val).forEach(item => {
            callers.push({ objectId: item[1]?.contactid, objectType: 'contact', description: item[1]?.fullname, phone: item[1]?.mobilephone })
        });
    };

    /**
     * save leads result
     * @param {string} entities 
     */
    var leadToCallers = function (entities) {
        let val = JSON.parse(entities);
        console.debug('[MSDynamicsCRM] Leads as Array', Object.values(val));

        Object.entries(val).forEach(item => {
            callers.push({ objectId: item[1]?.leadid, objectType: 'lead', description: item[1]?.firstname, phone: item[1]?.telephone1 })
        });
    };

    /**
     * createPhoneCall
     * @param caller Telephone number to associate the call
     *
     */
    var createPhoneCall = function (caller) {
        if (!Vocalcom.UCCore.isMaster()) {
            console.debug("[MSDynamicsCRM] Not Master can't create a phone call");
            return;
        }
        console.debug("[MSDynamicsCRM] PhoneCall creation requested", caller);

        CRMPhoneCallId = localStorage.getItem('phoneCallId');

        var ci = callers.length;

        if (ci >= 1) ci = callers[0].objectId;
        else {
            console.error("[MSDynamicsCRM] can not create Phonecall without an individual contact/account/lead identified");
            return;
        }
        var data = new PhoneCallData();

        if (!CRMPhoneCallId || CRMPhoneCallId == "" || CRMPhoneCallId == "null") {
            console.debug("[MSDynamicsCRM] There is no PhoneCall created for this call. Trying to create it");
            var entityLogicalName = "phonecall";
            var jsonData = JSON.stringify(data);
            Microsoft.CIFramework.createRecord(entityLogicalName, jsonData).then(
                function success(result) {
                    res = JSON.parse(result);
                    console.debug("[MSDynamicsCRM] ðŸ¦„ðŸ¦„ PhoneCall created with ID ðŸ¦„ðŸ¦„: " + res.id);
                    CRMPhoneCallId = res.id;
                    localStorage.setItem('phoneCallId', res.id);
                },
                function (error) {
                    console.error("[MSDynamicsCRM] Error creating phonecall: ", error);
                }
            );
        }
        else {
            console.debug("[MSDynamicsCRM] Already exists a phonecall, updating it");
            updatePhoneCall(data);

        }
    };

    /**
     * Get the properties for object type
     * @param {string} type 
     * @returns 
     */
    var getEntityProperties = function (type) {
        var properties = {
            'account': {
                'searchField': 'accountid',
                'entityFields': ['name', 'accountid', 'telephone1']
            },
            'lead': {
                'searchField': 'leadid',
                'entityFields': ['firstname', 'leadid', 'telephone1']
            },
            'default': {
                'searchField': 'contactid',
                'entityFields': ['firstname', 'lastname', 'fullname', 'contactid', 'mobilephone', 'ownerid']
            }
        }

        return properties[type] || properties['default'];
    }

    /**
     * Set search data
     * 
     * 
     */
    var setCallerResult = function () {
        try {
            var context = Vocalcom.UCCore.getGlobalContext()
            // Parse data to an array
            if (!fromClicktoCall && !context.callInfo.objectFromHistory) {
                callers = [];
                contactToCallers(tempContacts);
                accountToCallers(tempAccounts);
                leadToCallers(tempLeads);
            }
            console.log("[MSDynamicsCRM] The caller are " + callers.length + " callers", callers);
            let entityType = getEntityProperties(callers[0]?.objectType)
            let searchField = entityType.searchField;
            let entityFields = entityType.entityFields;
            if (Object.values(callers).length > 0) {
                if (Object.values(callers).length == 1) {
                    if (Vocalcom.UCCore.isMaster()) {
                        CRMPhoneCallId = localStorage.getItem('phoneCallId');
                        if (CRMPhoneCallId) {
                            var data = new PhoneCallData();
                            updatePhoneCall(data);
                        } else {
                            createPhoneCall();
                        }
                        searchAndOpenRecords(callers[0].objectId, searchField, callers[0].objectType, false, entityFields, false).then(
                            result => {
                                console.debug('[MSDynamicsCRM] Set unique contact', { result });
                            }
                        );
                    }
                    Vocalcom.UCCore.emitCRMObjectAttachedToCall(callers[0].objectId, callers[0].description);
                }
            }
            Vocalcom.UCCore.emitCallerSearchResult(callers);
        }
        catch (e) {
            console.log("[MSDynamicsCRM] Unable to find caller name- Exception: " + e);
        }
    };

    // event to create a new contact
    var createNewContact = function (caller) {
        var entityFormOptions = {};
        entityFormOptions["entityName"] = "contact";
        console.log("Create a new contact with phone number " + caller);
        Microsoft.CIFramework.openForm(JSON.stringify(entityFormOptions), JSON.stringify({ firstname: 'new', lastname: 'contact', mobilephone: caller })).then(
            function (success) {
                console.log(success);
            },
            function (error) {
                console.log(error);
            }
        );
    };

    // event to create a new account
    var createNewAccount = function (caller) {
        var entityFormOptions = {};
        entityFormOptions["entityName"] = "account";
        console.log("Create a new account with phone number " + caller);
        Microsoft.CIFramework.openForm(JSON.stringify(entityFormOptions), JSON.stringify({ telephone1: caller, name: 'new' })).then(
            function (success) {
                console.log(success);
            },
            function (error) {
                console.log(error);
            }
        );
    };

    // event to create a new lead
    var createNewLead = function (caller) {
        var entityFormOptions = {};
        entityFormOptions["entityName"] = "lead";
        console.log("Create a new lead with phone number " + caller);
        Microsoft.CIFramework.openForm(JSON.stringify(entityFormOptions), JSON.stringify({ telephone1: caller, name: 'new' })).then(
            function (success) {
                console.log(success);
            },
            function (error) {
                console.log(error);
            }
        );
    };

    /**
     * Get Phone calls for the user logged
     * @returns {Promise<object>}
     */
    var getPhoneCalls = function () {
        const userid = localStorage.USERID;
        return Microsoft.CIFramework.searchAndOpenRecords("phonecall", `?$select=phonenumber,directioncode,huuc_hermes_call_starttime,huuc_hermes_call_stoptime,_regardingobjectid_value&$filter=_createdby_value eq '${userid}'&$orderby=actualend desc&$top=20`, true);
    };

    Vocalcom.UCCore.getRecentCalls = function () {
        return new Promise((resolve, reject) => {
            getPhoneCalls().then(
                function success(result) {
                    res = JSON.parse(result);
                    console.debug("[MSDynamicsCRM] calls", Object.entries(res));
                    var calls = [];
                    for (const [key, call] of Object.entries(res)) {
                        var objType = call["_regardingobjectid_value@Microsoft.Dynamics.CRM.lookuplogicalname"];
                        if (objType === 'contact' || objType === 'account' || objType === 'lead') {
                            calls.push({
                                callerName: call["_regardingobjectid_value@OData.Community.Display.V1.FormattedValue"],
                                objectId: call["_regardingobjectid_value"],
                                objectType: objType,
                                callerPhoneNumber: call["phonenumber"],
                                startTime: call['huuc_hermes_call_starttime'],
                                endTime: call["huuc_hermes_call_stoptime"],
                                callDirection: call['directioncode'] ? 1 : 0		// 0: inbound, 1: outbound									
                            });
                        }
                    }
                    resolve(calls);
                },
                function (error) {
                    console.error("[MSDynamicsCRM]", error);
                    // handle error conditions
                    reject(error);
                }
            );
        });
    };

    var searchCaller = function (caller) {
        if (!searchingCaller) {
            var context = Vocalcom.UCCore.getGlobalContext()
            if (context.callInfo.objectFromHistory) {
                callers = [];
                callers.push(context.callInfo.objectFromHistory)
                setCallerResult();
            } else if (fromClicktoCall) {
                console.debug("[MSDynamicsCRM] coming from click to call", callers[0]);

                setCallerResult();
                fromClicktoCall = false;
                searchingCaller = false;
            }
            else {
                callers = [];
                searchingCaller = true;
                searchAndOpenRecords(caller, 'mobilephone', 'contact', true, ['firstname', 'lastname', 'fullname', 'contactid', 'mobilephone', 'ownerid'], false).then(
                    function (contacts) {    //We got the CRM contact record for our search query
                        try {
                            let val = JSON.parse(contacts);
                            console.debug('[MSDynamicsCRM] ðŸ± contacts matching with caller found: ', { val });

                            //Record the fullname and CRM record id

                            tempContacts = contacts;

                            //searchAccounts(caller);
                            searchAndOpenRecords(caller, 'telephone1', 'account', true, ['name', 'accountid', 'telephone1'], false).then(
                                function (accounts) {
                                    try {
                                        let val = JSON.parse(accounts);
                                        console.debug('[MSDynamicsCRM] ðŸ¦ Accounts matching with caller found: ', { val });

                                        tempAccounts = accounts;

                                        searchAndOpenRecords(caller, 'telephone1', 'lead', true, ['firstname', 'leadid', 'telephone1'], false).then(
                                            function (leads) {
                                                let val = JSON.parse(leads);
                                                console.debug('[MSDynamicsCRM] ðŸ¦ Leads matching with caller found: ', { val });

                                                tempLeads = leads;

                                                setCallerResult();
                                            }
                                        )
                                    }
                                    catch (e) {
                                        throw e;
                                    }
                                }
                            )


                            searchingCaller = false;
                        }
                        catch (e) {
                            console.log("[MSDynamicsCRM] Unable to find caller name- Exception: " + e);
                            searchingCaller = false;
                        }
                    }
                ).catch(function (reason) {
                    if (!reason) {
                        reason = "[MSDynamicsCRM] Unknown Reason";
                    }
                    searchingCaller = false;
                    console.log("[MSDynamicsCRM] Couldn't retrieve caller name because " + reason.toString());
                });
            }
        }
        else {
            console.debug("[MSDynamicsCRM] Already searching someone.")
        }
    };

    Vocalcom.UCCore.addHandler("OnCTIAdapterChangeMode", function () {
        Microsoft.CIFramework.setMode(currentDisplayMode == 0 ? 1 : 0);
    });

    Vocalcom.UCCore.addHandler("OnActivateClickToDial", function (callback) {
        clickToDialCallbackEvt = callback;
        Microsoft.CIFramework.setClickToAct(true);
        Microsoft.CIFramework.addHandler("onclicktoact", clickToActHandler);

    });


    /**
         * @param callStatusData The data of call disposition
         * @param {int} callStatusData.callStatusGroup disposition group
         * @param {int} callStatusData.callStatusNum disposition code
         * @param {int} callStatusData.callStatusDetail disposition detail 
         * @param {string} callStatusData.comment Comment entered by the agent 
         * @param {string} callStatusData.callbackTime Callback date and time
         * @param {string} callStatusData.phoneNumber Callback phone
         * @param {int} callStatusData.validity Callback validity
         * 
         */
    Vocalcom.UCCore.addHandler("OnSetCallDisposition", function (callStatusData) {
        var context = Vocalcom.UCCore.getGlobalContext();
        console.debug("[MSDynamicsCRM] setCallDisposition executed.", callStatusData);
        var session = context.callInfo;
        var callType = session.callType;
        var statusText = '';
        if (callStatusData.callStatusDescription != '') {
            statusText = callStatusData.callStatusDescription;
        }
        if (callStatusData.callStatusDetailDescription != '') {
            statusText = statusText + "/" + callStatusData.callStatusDetailDescription;
        }

        var data = new PhoneCallData();
        data.description = callStatusData.comment;
        data.statuscode = 2;
        data.statecode = 1;
        data.subcategory = statusText;
        var callStartTime = Vocalcom.UCCore.Telephony.getFirstCallStartTime();
        var callEndTime = Vocalcom.UCCore.Telephony.getFirstCallEndTime();
        var diffMs = callEndTime.getTime() - callStartTime.getTime();
        if (diffMs < 0) {
            diffMs = 0;
        }
        data.actualdurationminutes = Math.round((diffMs / 1000) / 60); // minutes

        console.debug("[MSDynamicsCRM] Calculated duration (ponele)", data.actualdurationminutes, diffMs);

        if (statusText != "") {
            data.subject = "(" + callType + ") " + statusText;
        }
        else {
            data.subject = callType;
        }
        updatePhoneCall(data);
    });


    Vocalcom.UCCore.addHandler("OnSearchForCaller", function (phoneNumber) {
        console.log("UCCore search for caller National Number", phoneNumber.National);
        console.log("UCCore search for caller International Number", phoneNumber.E164);
        searchCaller(phoneNumber);
    });

    var cleanSession = function () {
        var context = Vocalcom.UCCore.getGlobalContext();
        if (context.callInfo?.callState > LineStates.FREE) {
            return;
        }
        Memo = "";
        Tel = "";
        associateData = "";
        campaignId = "";
        campaignName = "";
        sessionId = "";
        localStorage.setItem('SIPHEADERS', JSON.stringify(null));
        localStorage.removeItem('phoneCallId');
        searchingCaller = false;
        fromClicktoCall = false;
    };
    Vocalcom.UCCore.addHandler("OnDeleteSession", function () {
        cleanSession();
    });
    Vocalcom.UCCore.addHandler("OnAgentReady", function () {
    });
    Vocalcom.UCCore.addHandler("OnAgentPause", function () {
    });
    // Vocalcom.UCCore.addHandler("OnOpenSession", function () {
    // cleanSession();
    // });

    /**
     * event when call start
     */
    Vocalcom.UCCore.addHandler("OnCallOnline", function () {
        var context = Vocalcom.UCCore.getGlobalContext();
        console.debug("[MSDynamicsCRM] OnCallOnline");
        CRMPhoneCallId = localStorage.getItem('phoneCallId');
        if (CRMPhoneCallId) {
            var data = new PhoneCallData();
            updatePhoneCall(data);
        } else {
            createPhoneCall(context.callInfo.caller);  /// And we create a new phonecall 
        }
    });


    Vocalcom.UCCore.addHandler("OnCallFree", function () {
        // set call phone object field
        console.debug("[MSDynamicsCRM] Ending voice call");

        var data = new PhoneCallData();

        data.statuscode = 2;
        data.statecode = 1;
        var callStartTime = Vocalcom.UCCore.Telephony.getFirstCallStartTime();
        var diffMs = Vocalcom.UCCore.Telephony.getFirstCallEndTime() - callStartTime;
        data.actualdurationminutes = Math.round(((diffMs % 86400000) % 3600000) / 60000); // minutes

        console.debug("[MSDynamicsCRM] updating call", data);
        updatePhoneCall(data);
    });


    Vocalcom.UCCore.addHandler("OnAttachCRMObjectToCall", function (objectId) {
        var context = Vocalcom.UCCore.getGlobalContext();
        var id = objectId;
        let caller = context.callInfo.searchCallerResult.find(obj => { return obj.objectId === id });
        console.debug('[MSDynamicsCRM] caller selected', { caller });
        callers = [];
        callers.push(caller);
        CRMPhoneCallId = localStorage.getItem('phoneCallId');
        if (CRMPhoneCallId) {
            var data = new PhoneCallData();
            updatePhoneCall(data);
        } else {
            createPhoneCall();
        }
        Vocalcom.UCCore.emitCallerSearchResult(callers);
        let entityProperties = getEntityProperties(caller.objectType);
        searchAndOpenRecords(caller.objectId, entityProperties.searchField, caller.objectType, false, entityProperties.entityFields, false).then(
            result => console.debug(`[MSDynamicsCRM] Set unique ${caller.objectType}`, { result })
        );
        Vocalcom.UCCore.emitCRMObjectAttachedToCall(caller.objectId, caller.description);
    });

    function OnOpenCRMObject(objectId, objectType) {
        var context = Vocalcom.UCCore.getGlobalContext();
        var id = objectId;
        if (typeof (objectType) === 'undefined' || !objectType) {
            let caller = context.callInfo.searchCallerResult.find(obj => { return obj.objectId === id });
            console.debug('[MSDynamicsCRM] caller selected', { caller });
            objectType = caller.objectType;
        }

        let entityProperties = getEntityProperties(objectType);

        searchAndOpenRecords(objectId, entityProperties.searchField, objectType, false, entityProperties.entityFields, false).then(
            result => console.debug(`[MSDynamicsCRM] Set unique ${objectType}`, { result })
        );
    }

    Vocalcom.UCCore.addHandler("OnOpenCRMObject", OnOpenCRMObject);

    Vocalcom.UCCore.addHandler("OnCreateCRMObject", function (objectType, params) {
        var context = Vocalcom.UCCore.getGlobalContext();
        if (objectType === 'contact') {
            createNewContact(context.callInfo.caller);
        } else if (objectType === 'account') {
            createNewAccount(context.callInfo.caller);
        } else if (objectType === 'lead') {
            createNewLead(context.callInfo.caller);
        }
    });


    Vocalcom.UCCore.addHandler("OnCallerSearchInputChange", function (val) {
        if (val.length > 3) {
            console.debug('[MSDynamicsCRM] searching ' + val);
            searchAndOpenRecords(`?$select=fullname,contactid,mobilephone&$filter=contains(mobilephone, '${val}') or contains(firstname, '${val}') or contains(lastname, '${val}') or contains(emailaddress1, '${val}')`, '', 'contact', true).then(contacts => {
                tempContacts = contacts;
                searchAndOpenRecords(`?$select=name,accountid,telephone1&$filter=contains(telephone1, '${val}') or contains(name, '${val}')`, '', 'account', true).then(accounts => {
                    tempAccounts = accounts;
                    searchAndOpenRecords(`?$select=firstname,leadid,telephone1&$filter=contains(telephone1, '${val}') or contains(firstname, '${val}')`, '', 'lead', true).then(leads => {
                        tempLeads = leads
                        callers = [];
                        contactToCallers(tempContacts);
                        accountToCallers(tempAccounts);
                        leadToCallers(tempLeads);
                        Vocalcom.UCCore.emitCallerSearchResult(callers);
                        if (callers.length == 1) {
                            OnOpenCRMObject(callers[0].objectId, callers[0].objectType);
                        }
                    });
                });
            });
        } else {
            Vocalcom.UCCore.emitCallerSearchResult([]);
        }
    });


    // Vocalcom.UCCore.getListContact = function () {
    // return new Promise((resolve, reject) => {
    // var listContact = [];		
    // listContact["group 1"] = [
    // {
    // Name: "Agent name",
    // Phone: "0155373054",
    // Email: "agent@vocalcom.com"
    // }
    // ];     
    // resolve(listContact);
    // });
    // };

})();