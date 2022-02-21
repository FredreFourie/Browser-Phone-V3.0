/**
* ====================
*  ☎️ CloudCo SIP Phone ☎️ 
* ====================
* A browser based SIP phone for Asterisk
* =============================================================
* File: phone.js
* License: N/A
* Owner: JFK Fourie
* Date: February 2022
*/

/* Global Settings
===================== */
const appversion = "0.0.1";
const sipjsversion = "0.1";

/* User Settings & Defaults
============================== */
let profileUserID = getDbItem("profileUserID", null);   // Internal reference ID. (DON'T CHANGE THIS!)
let profileUser = getDbItem("profileUser", null);       // eg: 100
let profileName = getDbItem("profileName", null);       // eg: John Smith
let ServerPath = getDbItem("ServerPath", null);         // eg: /ws
let SipUsername = getDbItem("SipUsername", null);       // eg: extension number
let SipPassword = getDbItem("SipPassword", null);       // eg: provided password

let userAgentStr = getDbItem("UserAgentStr", "Browser Phone "+ appversion +" (SIPJS - "+ sipjsversion +")");    // Set this to whatever you want.
let hostingPrefex = getDbItem("HostingPrefex", "");                                                             // Use if hosting off root directiory. eg: "/phone/" or "/static/"
let RegisterExpires = parseInt(getDbItem("RegisterExpires", 300));                                              // Registration expiry time (in seconds)
let WssInTransport = (getDbItem("WssInTransport", "1") == "1");                                                 // Set the transport parameter to wss when used in SIP URIs. (Required for Asterisk as it doesnt support Path)
let IpInContact = (getDbItem("IpInContact", "1") == "1");                                                       // Set a random IP address as the host value in the Contact header field and Via sent-by parameter. (Suggested for Asterisk)

let AutoAnswerEnabled = (getDbItem("AutoAnswerEnabled", "0") == "1");       // Automatically answers the phone when the call comes in, if you are not on a call already
let DoNotDisturbEnabled = (getDbItem("DoNotDisturbEnabled", "0") == "1");   // Rejects any inbound call, while allowing outbound calls
let CallWaitingEnabled = (getDbItem("CallWaitingEnabled", "1") == "1");     // Rejects any inbound call if you are on a call already.
let SelectRingingLine = (getDbItem("SelectRingingLine", "1") == "1");       // Selects the ringing line if you are not on another call ()

let AutoGainControl = (getDbItem("AutoGainControl", "1") == "1");       // Attempts to adjust the microphone volume to a good audio level. (OS may be better at this)
let EchoCancellation = (getDbItem("EchoCancellation", "1") == "1");     // Attemots to remove echo over the line.
let NoiseSuppression = (getDbItem("NoiseSuppression", "1") == "1");     // Attempts to clear the call qulity of noise.
let NotificationsActive = (getDbItem("Notifications", "0") == "1");

let DidLength = parseInt(getDbItem("DidLength", 6));                // DID length from which to decide if an incoming caller is a "contact" or an "extension".
let MaxDidLength = parseInt(getDbItem("MaxDidLength", 16));         // Maximum langth of any DID number including international dialled numbers.
let DisplayDateFormat = getDbItem("DateFormat", "YYYY-MM-DD");      // The display format for all dates. https://momentjs.com/docs/#/displaying/
let DisplayTimeFormat = getDbItem("TimeFormat", "h:mm:ss A");       // The display format for all times. https://momentjs.com/docs/#/displaying/

let DisableFreeDial = (getDbItem("DisableFreeDial", "0") == "1");       // Removes the Dial icon in the profile area, users will need to add buddies in order to dial.
let DisableBuddies = (getDbItem("DisableBuddies", "0") == "1");         // Removes the Add Someone menu item and icon from the profile area. Buddies will still be created automatically. 
let EnableTransfer = (getDbItem("EnableTransfer", "1") == "1");         // Controls Transfering during a call
let EnableConference = (getDbItem("EnableConference", "1") == "1");     // Controls Conference during a call
let AutoAnswerPolicy = getDbItem("AutoAnswerPolicy", "allow");          // allow = user can choose | disabled = feature is disabled | enabled = feature is always on
let DoNotDisturbPolicy = getDbItem("DoNotDisturbPolicy", "allow");      // allow = user can choose | disabled = feature is disabled | enabled = feature is always on
let CallWaitingPolicy = getDbItem("CallWaitingPolicy", "allow");        // allow = user can choose | disabled = feature is disabled | enabled = feature is always on

let EnableAlphanumericDial = (getDbItem("EnableAlphanumericDial", "0") == "1");     // Allows calling /[^\da-zA-Z\*\#\+]/g default is /[^\d\*\#\+]/g

/* System Variables 
======================*/
let localDB = window.localStorage;
let userAgent = null;
let CanvasCollection = [];
let Buddies = [];
let selectedBuddy = null;
let selectedLine = null;
let windowObj = null;
let alertObj = null;
let confirmObj = null;
let promptObj = null;
let menuObj = null;

let HasAudioDevice = false;
let HasSpeakerDevice = false;
let AudioinputDevices = [];
let SpeakerDevices = [];

let Lines = [];
let lang = {}
let audioBlobs = {}
let newLineNumber = 1;

/* Utillities 
================ */
function uID(){
    return Date.now()+Math.floor(Math.random()*10000).toString(16).toUpperCase();
}
function utcDateNow(){
    return moment().utc().format("YYYY-MM-DD HH:mm:ss UTC");
}
function getDbItem(itemIndex, defaultValue){
    var localDB = window.localStorage;
    if(localDB.getItem(itemIndex) != null) return localDB.getItem(itemIndex);
    return defaultValue;
}
function getAudioSrcID(){
    var id = localDB.getItem("AudioSrcId");
    return (id != null)? id : "default";
}
function getAudioOutputID(){
    var id = localDB.getItem("AudioOutputId");
    return (id != null)? id : "default";
}

function getRingerOutputID(){
    var id = localDB.getItem("RingOutputId");
    return (id != null)? id : "default";
}
function formatDuration(seconds){
    var sec = Math.floor(parseFloat(seconds));
    if(sec < 0){
        return sec;
    } 
    else if(sec >= 0 && sec < 60){
        return sec + " " + ((sec > 1) ? lang.seconds_plural : lang.second_single);
    } 
    else if(sec >= 60 && sec < 60 * 60){ // greater then a minute and less then an hour
        var duration = moment.duration(sec, 'seconds');
        return duration.minutes() + " "+ ((duration.minutes() > 1) ? lang.minutes_plural: lang.minute_single) +" " + duration.seconds() +" "+ ((duration.seconds() > 1) ? lang.seconds_plural : lang.second_single);
    } 
    else if(sec >= 60 * 60 && sec < 24 * 60 * 60){ // greater than an hour and less then a day
        var duration = moment.duration(sec, 'seconds');
        return duration.hours() + " "+ ((duration.hours() > 1) ? lang.hours_plural : lang.hour_single) +" " + duration.minutes() + " "+ ((duration.minutes() > 1) ? lang.minutes_plural: lang.minute_single) +" " + duration.seconds() +" "+ ((duration.seconds() > 1) ? lang.seconds_plural : lang.second_single);
    }
}
function formatBytes(bytes, decimals) {
    if (bytes === 0) return "0 "+ lang.bytes;
    var k = 1024;
    var dm = (decimals && decimals >= 0)? decimals : 2;
    var sizes = [lang.bytes, lang.kb, lang.mb, lang.gb, lang.tb, lang.pb, lang.eb, lang.zb, lang.yb];
    var i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
}
function getFilter(filter, keyword){
    if(filter.indexOf(",", filter.indexOf(keyword +": ") + keyword.length + 2) != -1){
        return filter.substring(filter.indexOf(keyword +": ") + keyword.length + 2, filter.indexOf(",", filter.indexOf(keyword +": ") + keyword.length + 2));
    }
    else {
        return filter.substring(filter.indexOf(keyword +": ") + keyword.length + 2);
    }
}

function GetAlternateLanguage(){
    var userLanguage = window.navigator.userLanguage || window.navigator.language; // "en", "en-US", "fr", "fr-FR", "es-ES", etc.
    // langtag = language["-"script]["-" region] *("-" variant) *("-" extension) ["-" privateuse]
    if(Language != "auto") userLanguage = Language;
    userLanguage = userLanguage.toLowerCase();
    if(userLanguage == "en" || userLanguage.indexOf("en-") == 0) return "";  // English is already loaded

    for(l = 0; l < availableLang.length; l++){
        if(userLanguage.indexOf(availableLang[l].toLowerCase()) == 0){
            console.log("Alternate Language detected: ", userLanguage);
            // Set up Moment with the same langugae settings
            moment.locale(userLanguage);
            return availableLang[l].toLowerCase();
        }
    }
    return "";
}

function base64toBlob(base64Data, contentType) {
    if(base64Data.indexOf("," != -1)) base64Data = base64Data.split(",")[1]; // [data:image/png;base64] , [xxx...]
    var byteCharacters = atob(base64Data);
    var slicesCount = Math.ceil(byteCharacters.length / 1024);
    var byteArrays = new Array(slicesCount);
    for (var s = 0; s < slicesCount; ++s) {
        var begin = s * 1024;
        var end = Math.min(begin + 1024, byteCharacters.length);
        var bytes = new Array(end - begin);
        for (var offset = begin, i = 0; offset < end; ++i, ++offset) {
            bytes[i] = byteCharacters[offset].charCodeAt(0);
        }
        byteArrays[s] = new Uint8Array(bytes);
    }
    return new Blob(byteArrays, { type: contentType });
}
function MakeDataArray(defaultValue, count){
    var rtnArray = new Array(count);
    for(var i=0; i< rtnArray.length; i++) {
        rtnArray[i] = defaultValue;
    }
    return rtnArray;
}

/* Windows & Doc Events
========================== */
$(window).on("beforeunload", function() {
    Unregister();
});
$(window).on("resize", function() {
    UpdateUI();
});
$(document).ready(function () {
    /* Load Phone Options
    ======================== */
    var options = (typeof phoneOptions !== 'undefined')? phoneOptions : {};
    if(options.welcomeScreen !== undefined) welcomeScreen = options.welcomeScreen;
    if(options.profileUser !== undefined) profileUser = options.profileUser;
    if(options.profileName !== undefined) profileName = options.profileName;
    if(options.ServerPath !== undefined) ServerPath = options.ServerPath;
    if(options.SipUsername !== undefined) SipUsername = options.SipUsername;
    if(options.SipPassword !== undefined) SipPassword = options.SipPassword;
    if(options.TransportConnectionTimeout !== undefined) TransportConnectionTimeout = options.TransportConnectionTimeout;
    if(options.TransportReconnectionAttempts !== undefined) TransportReconnectionAttempts = options.TransportReconnectionAttempts;
    if(options.TransportReconnectionTimeout !== undefined) TransportReconnectionTimeout = options.TransportReconnectionTimeout;
    if(options.userAgentStr !== undefined) userAgentStr = options.userAgentStr;
    if(options.hostingPrefex !== undefined) hostingPrefex = options.hostingPrefex;
    if(options.RegisterExpires !== undefined) RegisterExpires = options.RegisterExpires;
    if(options.IpInContact !== undefined) IpInContact = options.IpInContact;
    if(options.IceStunServerJson !== undefined) IceStunServerJson = options.IceStunServerJson;
    if(options.IceStunCheckTimeout !== undefined) IceStunCheckTimeout = options.IceStunCheckTimeout;
    if(options.AutoAnswerEnabled !== undefined) AutoAnswerEnabled = options.AutoAnswerEnabled;
    if(options.DoNotDisturbEnabled !== undefined) DoNotDisturbEnabled = options.DoNotDisturbEnabled;
    if(options.CallWaitingEnabled !== undefined) CallWaitingEnabled = options.CallWaitingEnabled;
    if(options.ShowCallAnswerWindow !== undefined) ShowCallAnswerWindow = options.ShowCallAnswerWindow;
    if(options.SelectRingingLine !== undefined) SelectRingingLine = options.SelectRingingLine;
    if(options.AutoGainControl !== undefined) AutoGainControl = options.AutoGainControl;
    if(options.EchoCancellation !== undefined) EchoCancellation = options.EchoCancellation;
    if(options.NoiseSuppression !== undefined) NoiseSuppression = options.NoiseSuppression;
    if(options.NotificationsActive !== undefined) NotificationsActive = options.NotificationsActive;
    if(options.DisplayDateFormat !== undefined) DisplayDateFormat = options.DisplayDateFormat;
    if(options.DisplayTimeFormat !== undefined) DisplayTimeFormat = options.DisplayTimeFormat;
    if(options.DisableFreeDial !== undefined) DisableFreeDial = options.DisableFreeDial;
    if(options.DisableBuddies !== undefined) DisableBuddies = options.DisableBuddies;
    if(options.EnableTransfer !== undefined) EnableTransfer = options.EnableTransfer;
    if(options.AutoAnswerPolicy !== undefined) AutoAnswerPolicy = options.AutoAnswerPolicy;
    if(options.DoNotDisturbPolicy !== undefined) DoNotDisturbPolicy = options.DoNotDisturbPolicy;
    if(options.CallWaitingPolicy !== undefined) CallWaitingPolicy = options.CallWaitingPolicy;
    if(options.CallRecordingPolicy !== undefined) CallRecordingPolicy = options.CallRecordingPolicy;
    if(options.IntercomPolicy !== undefined) IntercomPolicy = options.IntercomPolicy;
    if(options.EnableAccountSettings !== undefined) EnableAccountSettings = options.EnableAccountSettings;
    if(options.EnableAppearanceSettings !== undefined) EnableAppearanceSettings = options.EnableAppearanceSettings;
    if(options.EnableNotificationSettings !== undefined) EnableNotificationSettings = options.EnableNotificationSettings;
    if(options.EnableAlphanumericDial !== undefined) EnableAlphanumericDial = options.EnableAlphanumericDial;

    console.log("Runtime options", options);

});

/* UI
======== */
function UpdateUI(){
    if($(window).outerWidth() < 920){
        // Narrow Layout
        if(selectedBuddy == null & selectedLine == null) {
            // Nobody Selected
            $("#rightContent").hide();

            $("#leftContent").css("width", "100%");
            $("#leftContent").show();
        }
        else {
            $("#rightContent").css("margin-left", "0px");
            $("#rightContent").show();
    
            $("#leftContent").hide();
                
            if(selectedBuddy != null) updateScroll(selectedBuddy.identity);
        }
    }
    else {
        // Wide Screen Layout
        if(selectedBuddy == null & selectedLine == null) {
            $("#leftContent").css("width", "100%");
            $("#rightContent").css("margin-left", "0px");
            $("#leftContent").show();
            $("#rightContent").hide();
        }
        else{
            $("#leftContent").css("width", "320px");
            $("#rightContent").css("margin-left", "320px");
            $("#leftContent").show();
            $("#rightContent").show();
    
            if(selectedBuddy != null) updateScroll(selectedBuddy.identity);
        }
    }
    for(var l=0; l<Lines.length; l++){
        updateLineScroll(Lines[l].LineNumber);
        RedrawStage(Lines[l].LineNumber, false);
    }
    HidePopup();
}

/* UI Windows
================ */
function AddSomeoneWindow(numberStr){
    ShowContacts();

    $("#myContacts").hide();
    $("#actionArea").empty();

    var html = "<div style=\"text-align:right\"><button onclick=\"ShowContacts()\"><i class=\"fa fa-close\"></i></button></div>"
    
    html += "<div border=0 class=UiSideField>";

    html += "<div class=UiText>"+ lang.full_name +":</div>";
    html += "<div><input id=AddSomeone_Name class=UiInputText type=text placeholder='"+ lang.eg_full_name +"'></div>";
    html += "<div><input type=checkbox id=AddSomeone_Dnd><label for=AddSomeone_Dnd>"+ lang.allow_calls_on_dnd +"</label></div>";

    //Types:
    html += "<ul style=\"list-style-type:none\">";
    html += "<li><input type=radio name=buddyType id=type_contact><label for=type_contact>"+ lang.addressbook_contact +"</label>";
    html += "</ul>";

    html += "<div id=RowDescription>";
    html += "<div class=UiText>"+ lang.title_description +":</div>";
    html += "<div><input id=AddSomeone_Desc class=UiInputText type=text placeholder='"+ lang.eg_general_manager +"'></div>";
    html += "</div>";

    html += "<div id=RowExtension>";
    html += "<div class=UiText>"+ lang.internal_subscribe_extension +":</div>";
    html += "<div><input id=AddSomeone_Exten class=UiInputText type=text placeholder='"+ lang.eg_internal_subscribe_extension +"'></div>";
    html += "<div><input type=checkbox id=AddSomeone_Subscribe checked><label for=AddSomeone_Subscribe>"+ lang.subscribe_to_dev_state +"</label></div>";
    html += "</div>";

    html += "<div id=RowMobileNumber>";
    html += "<div class=UiText>"+ lang.mobile_number +":</div>";
    html += "<div><input id=AddSomeone_Mobile class=UiInputText type=text placeholder='"+ lang.eg_mobile_number +"'></div>";
    html += "</div>";

    html += "<div id=RowEmail>";
    html += "<div class=UiText>"+ lang.email +":</div>";
    html += "<div><input id=AddSomeone_Email class=UiInputText type=text placeholder='"+ lang.eg_email +"'></div>";
    html += "</div>";

    html += "</div>";

    html += "<div class=UiWindowButtonBar id=ButtonBar></div>";

    $("#actionArea").html(html);

    // Button Actions:
    var buttons = [];
    buttons.push({
        text: lang.add,
        action: function(){
            // Basic Validation
            var type = "extension";
            if($("#type_exten").is(':checked')){
                type = "extension";
            } else if($("#type_xmpp").is(':checked')){
                type = "xmpp";
            } else if($("#type_contact").is(':checked')){
                type = "contact";
            }
            if($("#AddSomeone_Name").val() == "") return;
            if(type == "extension" || type == "xmpp"){
                if($("#AddSomeone_Exten").val() == "") return;
            }

            // Add Contact / Extension
            var json = JSON.parse(localDB.getItem(profileUserID + "-Contacts"));
            if(json == null) json = InitUserBuddies();

            var buddyObj = null;
            if(type == "extension"){
                // Add Extension
                var id = uID();
                var dateNow = utcDateNow();
                json.DataCollection.push(
                    {
                        Type: "extension",
                        LastActivity: dateNow,
                        ExtensionNumber: $("#AddSomeone_Exten").val(),
                        MobileNumber: $("#AddSomeone_Mobile").val(),
                        uID: id,
                        cID: null,
                        gID: null,
                        jid: null,
                        DisplayName: $("#AddSomeone_Name").val(),
                        Description: $("#AddSomeone_Desc").val(),
                        Email: $("#AddSomeone_Email").val(),
                        MemberCount: 0,
                        EnableDuringDnd: $("#AddSomeone_Dnd").is(':checked'),
                        Subscribe: $("#AddSomeone_Subscribe").is(':checked')
                    }
                );
                buddyObj = new Buddy("extension", id, $("#AddSomeone_Name").val(), $("#AddSomeone_Exten").val(), $("#AddSomeone_Mobile").val(), dateNow, $("#AddSomeone_Desc").val(), $("#AddSomeone_Email").val(), jid, $("#AddSomeone_Dnd").is(':checked'), $("#AddSomeone_Subscribe").is(':checked'));
                
                // Add memory object
                AddBuddy(buddyObj, false, false, $("#AddSomeone_Subscribe").is(':checked'));
            }
            if(type == "contact"){
                // Add Regular Contact
                var id = uID();
                var dateNow = utcDateNow();
                json.DataCollection.push(
                    {
                        Type: "contact", 
                        LastActivity: dateNow,
                        ExtensionNumber: "", 
                        MobileNumber: $("#AddSomeone_Mobile").val(),
                        uID: null,
                        cID: id,
                        gID: null,
                        jid: null,
                        DisplayName: $("#AddSomeone_Name").val(),
                        Description: $("#AddSomeone_Desc").val(),
                        Email: $("#AddSomeone_Email").val(),
                        MemberCount: 0,
                        EnableDuringDnd: $("#AddSomeone_Dnd").is(':checked'),
                        Subscribe: false
                    }
                );
                buddyObj = new Buddy("contact", id, $("#AddSomeone_Name").val(), "", $("#AddSomeone_Mobile").val(), dateNow, $("#AddSomeone_Desc").val(), $("#AddSomeone_Email").val(), jid, $("#AddSomeone_Dnd").is(':checked'), false);

                // Add memory object
                AddBuddy(buddyObj, false, false, false);
            }

        // Save To DB
        json.TotalRows = json.DataCollection.length;
        localDB.setItem(profileUserID + "-Contacts", JSON.stringify(json));

        UpdateBuddyList();

        ShowContacts();

        }
    });
    // Show
    $("#actionArea").show();
    $("#AddSomeone_Name").focus();

    // Do Onload
    window.setTimeout(function(){
        $("#type_exten").change(function(){
            if($("#type_exten").is(':checked')){
                $("#RowDescription").show();
                $("#RowExtension").show();
                $("#RowMobileNumber").show();
                $("#RowEmail").show();
            }
        });
        $("#type_xmpp").change(function(){
            if($("#type_xmpp").is(':checked')){
                $("#RowDescription").hide();
                $("#RowExtension").show();
                $("#RowMobileNumber").hide();
                $("#RowEmail").hide();
            }
        });
        $("#type_contact").change(function(){
            if($("#type_contact").is(':checked')){
                $("#RowDescription").show();
                $("#RowExtension").hide();
                $("#RowMobileNumber").show();
                $("#RowEmail").show();
            }
        });
    }, 0);
}
function checkNotificationPromise() {
    try {
        Notification.requestPermission().then();
    }
    catch(e) {
        return false;
    }
    return true;
}
function HandleNotifyPermission(p){
    if(p == "granted") {
        // Good
    }
    else {
        Alert(lang.alert_notification_permission, lang.permission, function(){
            console.log("Attempting to uncheck the checkbox...");
            $("#Settings_Notifications").prop("checked", false);
        });
    }
}
function EditBuddyWindow(buddy){

    var buddyObj = FindBuddyByIdentity(buddy);
    if(buddyObj == null){
        Alert(lang.alert_not_found, lang.error);
        return;
    }
    var buddyJson = {};
    var itemId = -1;
    var json = JSON.parse(localDB.getItem(profileUserID + "-Contacts"));
    $.each(json.DataCollection, function (i, item) {
        if(item.uID == buddy || item.cID == buddy || item.gID == buddy){
            buddyJson = item;
            itemId = i;
            return false;
        }
    });

    if(buddyJson == {}){
        Alert(lang.alert_not_found, lang.error);
        return;
    }
    var cropper;

    var html = "<div border=0 class='UiWindowField'>";

    html += "<div id=ImageCanvas style=\"width:150px; height:150px\"></div>";
    html += "<div style=\"float:left; margin-left:200px;\"><input id=fileUploader type=file></div>";
    html += "<div style=\"margin-top: 50px\"></div>";
    
    html += "<div class=UiText>"+ lang.full_name +":</div>";
    html += "<div><input id=AddSomeone_Name class=UiInputText type=text placeholder='"+ lang.eg_full_name +"' value='"+ ((buddyJson.DisplayName && buddyJson.DisplayName != "null" && buddyJson.DisplayName != "undefined")? buddyJson.DisplayName : "") +"'></div>";
    html += "<div><input type=checkbox id=AddSomeone_Dnd "+ ((buddyJson.EnableDuringDnd == true)? "checked" : "" ) +"><label for=AddSomeone_Dnd>Allow calls while on Do Not Disturb</label></div>";

    html += "<div class=UiText>"+ lang.title_description +":</div>";
    html += "<div><input id=AddSomeone_Desc class=UiInputText type=text placeholder='"+ lang.eg_general_manager +"' value='"+ ((buddyJson.Description && buddyJson.Description != "null" && buddyJson.Description != "undefined")? buddyJson.Description : "") +"'></div>";

    html += "<div class=UiText>"+ lang.mobile_number +":</div>";
    html += "<div><input id=AddSomeone_Mobile class=UiInputText type=text placeholder='"+ lang.eg_mobile_number +"' value='"+ ((buddyJson.MobileNumber && buddyJson.MobileNumber != "null" && buddyJson.MobileNumber != "undefined")? buddyJson.MobileNumber : "") +"'></div>";

    html += "<div class=UiText>"+ lang.email +":</div>";
    html += "<div><input id=AddSomeone_Email class=UiInputText type=text placeholder='"+ lang.email +"' value='"+ ((buddyJson.Email && buddyJson.Email != "null" && buddyJson.Email != "undefined")? buddyJson.Email : "") +"'></div>";

    OpenWindow(html, lang.edit, 480, 640, false, true, lang.save, function(){

        if($("#AddSomeone_Name").val() == "") return;

        buddyJson.LastActivity = utcDateNow();
        buddyObj.lastActivity = buddyJson.LastActivity;

        buddyJson.DisplayName = $("#AddSomeone_Name").val();
        buddyObj.CallerIDName = buddyJson.DisplayName;

        buddyJson.Description = $("#AddSomeone_Desc").val();
        buddyObj.Desc = buddyJson.Description;

        buddyJson.MobileNumber = $("#AddSomeone_Mobile").val();
        buddyObj.MobileNumber = buddyJson.MobileNumber;

        buddyJson.Email = $("#AddSomeone_Email").val();
        buddyObj.Email = buddyJson.Email;

        buddyJson.EnableDuringDnd = $("#AddSomeone_Dnd").is(':checked');
        buddyObj.EnableDuringDnd = buddyJson.EnableDuringDnd;
        
        if(buddyJson.Type == "extension" || buddyJson.Type == "xmpp"){
            buddyJson.Subscribe = $("#AddSomeone_Subscribe").is(':checked');
            if(buddyObj.EnableSubscribe == true) UnsubscribeBuddy(buddyObj);
            if(buddyJson.Subscribe == true) SubscribeBuddy(buddyObj);
        }

        // Update Image
        var constraints = { 
            type: 'base64', 
            size: 'viewport', 
            format: 'png', 
            quality: 1, 
            circle: false 
        }
        $("#ImageCanvas").croppie('result', constraints).then(function(base64) {
            if(buddyJson.Type == "extension"){
                localDB.setItem("img-"+ buddyJson.uID +"-extension", base64);
                $("#contact-"+ buddyJson.uID +"-picture-main").css("background-image", 'url('+ getPicture(buddyJson.uID, 'extension') +')');
            }
            else if(buddyJson.Type == "contact") {
                localDB.setItem("img-"+ buddyJson.cID +"-contact", base64);
                $("#contact-"+ buddyJson.cID +"-picture-main").css("background-image", 'url('+ getPicture(buddyJson.cID, 'contact') +')');
            }
            // Update
            UpdateBuddyList();
        });
        // Update: 
        json.DataCollection[itemId] = buddyJson;

        // Save To DB
        localDB.setItem(profileUserID + "-Contacts", JSON.stringify(json));

        CloseWindow();
    }, lang.cancel, function(){
        CloseWindow();
    }, function(){
        // Upload
        cropper = $("#ImageCanvas").croppie({
            viewport: { width: 150, height: 150, type: 'circle' }
        });

        // Preview Existing Image
        if(buddyJson.Type == "extension"){
            $("#ImageCanvas").croppie('bind', { url: getPicture(buddyJson.uID, "extension") }).then();
        }
        else if(buddyJson.Type == "contact") {
            $("#ImageCanvas").croppie('bind', { url: getPicture(buddyJson.cID, "contact") }).then();
        }

        if(buddyJson.Type == "xmpp"){
            $("#fileUploader").hide();
            $("#AddSomeone_Name").attr("disabled", true);
            $("#AddSomeone_Desc").attr("disabled", true);
            $("#AddSomeone_Mobile").attr("disabled", true);
            $("#AddSomeone_Email").attr("disabled", true);
        }

        // File Changes
        $("#fileUploader").change(function () {
            var filesArray = $(this).prop('files');
        
            if (filesArray.length == 1) {
                var uploadId = Math.floor(Math.random() * 1000000000);
                var fileObj = filesArray[0];
                var fileName = fileObj.name;
                var fileSize = fileObj.size;
        
                if (fileSize <= 52428800) {
                    console.log("Adding (" + uploadId + "): " + fileName + " of size: " + fileSize + "bytes");
        
                    var reader = new FileReader();
                    reader.Name = fileName;
                    reader.UploadId = uploadId;
                    reader.Size = fileSize;
                    reader.onload = function (event) {
                        $("#ImageCanvas").croppie('bind', {
                            url: event.target.result
                        });
                    }
                    reader.readAsDataURL(fileObj);
                }
                else {
                    Alert(lang.alert_file_size, lang.error);
                }
            }
            else {
                Alert(lang.alert_single_file, lang.error);
            }
        });
    });
}

/* Initialize UI 
=================== */
function InitUi(){

    var phone = $("#Phone");
    phone.empty();
    phone.attr("class", "pageContainer");

    // Left Section
    var leftSection = $("<div/>");
    leftSection.attr("id", "leftContent");
    leftSection.attr("style", "float:left; height: 100%; width:320px");

    var leftHTML = "<table style=\"height:100%; width:100%\" cellspacing=5 cellpadding=0>";
    leftHTML += "<tr><td class=streamSection style=\"height: 77px\">";
    
    // Profile User
    leftHTML += "<div class=profileContainer>";
    leftHTML += "<div class=contact id=UserProfile style=\"cursor: default; margin-bottom:5px;\">";
    leftHTML += "<div id=UserProfilePic class=buddyIcon></div>";
    leftHTML += "<span class=settingsMenu><button id=SettingsMenu><i class=\"fa fa-cogs\"></i></button></span>";
    leftHTML += "<div class=contactNameText style=\"margin-right: 0px;\">"

    // Status
    leftHTML += "<span id=dereglink class=dotOnline style=\"display:none\"></span>";
    leftHTML += "<span id=WebRtcFailed class=dotFailed style=\"display:none\"></span>";
    leftHTML += "<span id=reglink class=dotOffline></span>";

    // User
    leftHTML += " <span id=UserDID></span> - <span id=UserCallID></span>"
    leftHTML += "</div>";
    leftHTML += "<div id=regStatus class=presenceText>&nbsp;</div>";
    leftHTML += "</div>";

    // Line
    leftHTML += "<div style=\"margin-left:5px; margin-right:5px; margin-bottom: 5px; border-top:1px solid #383838\"></div>";

    // Action Buttons
    leftHTML += "<div style=\"padding-left:5px; padding-right:5px\">";
    leftHTML += "<button id=BtnFindBuddy><i class=\"fa fa-search\"></i></button>";
    leftHTML += "<span id=divFindBuddy class=searchClean style=\"display:none\"><INPUT id=txtFindBuddy type=text autocomplete=none style=\"width:120px;\"></span>";
    leftHTML += "<button id=BtnFreeDial><i class=\"fa fa-phone\"></i></button>";
    leftHTML += "<button id=BtnAddSomeone><i class=\"fa fa-user-plus\"></i></button>";
    if(false){
        // TODO
       leftHTML += "<button id=BtnCreateGroup><i class=\"fa fa-users\"></i><i class=\"fa fa-plus\" style=\"font-size:9px\"></i></button>";
   }
   leftHTML += "</div>";

   leftHTML += "</div>";
   leftHTML += "</td></tr>";
   leftHTML += "<tr><td class=streamSection>"

   // Lines & Buddies
   leftHTML += "<div id=myContacts class=\"contactArea cleanScroller\"></div>"
   leftHTML += "<div id=actionArea style=\"display:none\" class=\"contactArea cleanScroller\"></div>"
   
   leftHTML += "</td></tr>";
   leftHTML += "</table>";

   leftSection.html(leftHTML);
   
   // Right Section
   var rightSection = $("<div/>");
   rightSection.attr("id", "rightContent");
   rightSection.attr("style", "margin-left: 320px; height: 100%");

   phone.append(leftSection);
   phone.append(rightSection);

   if(DisableFreeDial == true) $("#BtnFreeDial").hide();
   if(DisableBuddies == true) {
       $("#BtnFindBuddy").hide();
       $("#BtnAddSomeone").hide();
       $("#BtnFreeDial").show();
   }
   $("#UserDID").html(profileUser);
    $("#UserCallID").html(profileName);
    $("#UserProfilePic").css("background-image", "url('"+ getPicture("profilePicture") +"')");
    
    $("#BtnFindBuddy").attr("title", lang.find_someone)
    $("#BtnFindBuddy").on('click', function(event){
        $("#divFindBuddy").toggle();
    });
    $("#txtFindBuddy").attr("placeholder", lang.find_someone)
    $("#txtFindBuddy").on('keyup', function(event){
        UpdateBuddyList();
    });
    $("#BtnFreeDial").attr("title", lang.call)
    $("#BtnFreeDial").on('click', function(event){
        ShowDial();
    });
    $("#BtnAddSomeone").attr("title", lang.add_someone)
    $("#BtnAddSomeone").on('click', function(event){
        AddSomeoneWindow();
    });
    $("#SettingsMenu").attr("title", lang.configure_extension)
    $("#SettingsMenu").on('click', function(event){
        ShowMyProfileMenu(this);
    });

    // Register Buttons
    $("#reglink").on('click', Register);
    $("#dereglink").on('click', Unregister);

    // WebRTC Error Page
    $("#WebRtcFailed").on('click', function(){
        Confirm(lang.error_connecting_web_socket, lang.web_socket_error, function(){
            window.open("https://"+ wssServer +":"+ WebSocketPort +"/httpstatus");
        }, null);
    });

    UpdateUI();
    // Check if you account is created
    if(profileUserID == null ){
        ShowMyProfile();
        return; // Don't load any more, after applying settings, the page must reload.
    }

    PopulateBuddyList();

    // Select Last user
    if(localDB.getItem("SelectedBuddy") != null){
        console.log("Selecting previously selected buddy...", localDB.getItem("SelectedBuddy"));
        SelectBuddy(localDB.getItem("SelectedBuddy"));
        UpdateUI();
    }

    // Show Welcome Screen
    if(welcomeScreen){
        if(localDB.getItem("WelcomeScreenAccept") != "yes"){
            OpenWindow(welcomeScreen, lang.welcome, 480, 800, true, false, lang.accept, function(){
                localDB.setItem("WelcomeScreenAccept", "yes");
                CloseWindow();
            }, null, null, null, null);
        }
    }

    PreloadAudioFiles();

    CreateUserAgent();
}

function ShowMyProfileMenu(obj){
    var enabledHtml = " <i class=\"fa fa-check\" style=\"float: right; line-height: 18px;\"></i>";

    var items = [];
    items.push({ icon: "fa fa-refresh", text: lang.refresh_registration, value: 1});
    items.push({ icon: "fa fa-wrench", text: lang.configure_extension, value: 2});
    items.push({ icon: null, text: "-" });
    items.push({ icon: "fa fa-user-plus", text: lang.add_someone, value: 3});
    // items.push({ icon: "fa fa-users", text: lang.create_group, value: 4}); // TODO
    items.push({ icon : null, text: "-" });
    if(AutoAnswerEnabled == true){
        items.push({ icon: "fa fa-phone", text: lang.auto_answer + enabledHtml, value: 5});
    }
    else {
        items.push({ icon: "fa fa-phone", text: lang.auto_answer, value: 5});
    }
    if(DoNotDisturbEnabled == true){
        items.push({ icon: "fa fa-ban", text: lang.do_no_disturb + enabledHtml, value: 6});
    }
    else {
        items.push({ icon: "fa fa-ban", text: lang.do_no_disturb, value: 6});
    }
    if(CallWaitingEnabled == true){
        items.push({ icon: "fa fa-volume-control-phone", text: lang.call_waiting + enabledHtml, value: 7});
    }
    else {
        items.push({ icon: "fa fa-volume-control-phone", text: lang.call_waiting, value: 7});
    }
    var menu = {
        selectEvent : function( event, ui ) {
            var id = ui.item.attr("value");
            HidePopup();
            if(id == "1") {
                RefreshRegistration();
            }
            if(id == "2") {
                ShowMyProfile();
            }
            if(id == "3") {
                AddSomeoneWindow();
            }
            if(id == "5") {
                ToggleAutoAnswer();
            }
            if(id == "6") {
                ToggleDoNoDisturb();
            }
            if(id == "7") {
                ToggleCallWaiting();
            }
            if(id == "9") {
                SetStatusWindow();
            }

        },
        createEvent : null,
        autoFocus : true,
        items : items
    }
    PopupMenu(obj, menu);
}

function PreloadAudioFiles(){
    audioBlobs.Alert = { file : "Alert.mp3", url : hostingPrefex +"media/Alert.mp3" }
    audioBlobs.Ringtone = { file : "Ringtone_1.mp3", url : hostingPrefex +"media/Ringtone_1.mp3" }
    audioBlobs.speech_orig = { file : "speech_orig.mp3", url : hostingPrefex +"media/speech_orig.mp3" }
    audioBlobs.Busy_UK = { file : "Tone_Busy-UK.mp3", url : hostingPrefex +"media/Tone_Busy-UK.mp3" }
    audioBlobs.CallWaiting = { file : "Tone_CallWaiting.mp3", url : hostingPrefex +"media/Tone_CallWaiting.mp3" }
    audioBlobs.Congestion_UK = { file : "Tone_Congestion-UK.mp3", url : hostingPrefex +"media/Tone_Congestion-UK.mp3" }
    $.each(audioBlobs, function (i, item) {
        var oReq = new XMLHttpRequest();
        oReq.open("GET", item.url, true);
        oReq.responseType = "blob";
        oReq.onload = function(oEvent) {
            var reader = new FileReader();
            reader.readAsDataURL(oReq.response);
            reader.onload = function() {
                item.blob = reader.result;
            }
        }
        oReq.send();
    });
    // console.log(audioBlobs);
}

/* User Agent
================ */
function CreateUserAgent() {
    console.log("Creating User Agent...");
    var options = {
        uri: SIP.UserAgent.makeURI("sip:"+ SipUsername + "@" + wssServer),
        transportOptions: {
            server: "wss://" + wssServer + ":"+ ServerPath,
            traceSip: false,
            connectionTimeout: TransportConnectionTimeout
            // keepAliveInterval: 30 // Uncomment this and make this any number greater then 0 for keep alive... 
            // NB, adding a keep alive will NOT fix bad interent, if your connection cannot stay open you probably 
            // have a router or ISP issue, and if your internet is so poor that you need to some how keep it alive with empty packets
            // upgrade you internt connection.
        },
        sessionDescriptionHandlerFactoryOptions: {
            peerConnectionConfiguration :{
                // bundlePolicy: "balanced",
                // certificates: undefined,
                // iceCandidatePoolSize: 0,
                // iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
                // iceTransportPolicy: "all",
                // peerIdentity: undefined,
                // rtcpMuxPolicy: "require",
            },
            iceGatheringTimeout: IceStunCheckTimeout
        },
        displayName: profileName,
        authorizationUsername: SipUsername,
        authorizationPassword: SipPassword,
        contactParams: { "transport" : "wss" },
        hackIpInContact: IpInContact,           // Asterisk should also be set to rewrite contact
        userAgentString: userAgentStr,
        autoStart: false,
        autoStop: true,
        register: false,
        noAnswerTimeout: 120,
        delegate: {
            onInvite: function (sip){
                ReceiveCall(sip);
            },
            onMessage: function (sip){
                ReceiveOutOfDialogMessage(sip);
            }
        }
    }
    if(IceStunServerJson != ""){
        options.sessionDescriptionHandlerFactoryOptions.peerConnectionConfiguration.iceServers = JSON.parse(IceStunServerJson);
    }
    userAgent = new SIP.UserAgent(options);
    userAgent.isRegistered = function(){
        return (userAgent && userAgent.registerer && userAgent.registerer.state == SIP.RegistererState.Registered);
    }
    userAgent.sessions = userAgent._sessions;
    userAgent.registrationCompleted = false;
    userAgent.transport.ReconnectionAttempts = TransportReconnectionAttempts;

    console.log("Creating User Agent... Done");

    userAgent.transport.onConnect = function(){
        onTransportConnected();
    }
    userAgent.transport.onDisconnect = function(error){
        if(error){
            onTransportConnectError(error);
        }
        else {
            onTransportDisconnected();
        }
    }

    var RegistererOptions = { 
        expires: RegisterExpires
    }
    userAgent.registerer = new SIP.Registerer(userAgent, RegistererOptions);
    console.log("Creating Registerer... Done");

    userAgent.registerer.stateChange.addListener(function(newState){
        console.log("User Agent Registration State:", newState);
        switch (newState) {
            case SIP.RegistererState.Initial:
                break;
            case SIP.RegistererState.Registered:
                onRegistered();
                break;
            case SIP.RegistererState.Unregistered:
                onUnregistered();
                break;
            case SIP.RegistererState.Terminated:
                break;
        }
    });
    userAgent.start().catch(function(error){
        onTransportConnectError(error);
    });
}

/* Transporting 
================== */
function onTransportConnected(){
    console.log("Connected!");
    $("#WebRtcFailed").hide();

    userAgent.transport.ReconnectionAttempts = TransportReconnectionAttempts;

    CloseWindow(true);

    // Auto start register
    window.setTimeout(function (){
        Register();
    }, 500);
}
function onTransportConnectError(error){
    console.warn("Connection Failed:", error);
    userAgent.isReRegister = false;
    if(userAgent && userAgent.registerer && userAgent.registerer.state == SIP.RegistererState.Registered) {
        userAgent.registerer.unregister().catch(function(){
            // This will fail because the transport is down
            // But we need this so that it can register again
        });
    }
    userAgent.isReRegister = false;

    $("#WebRtcFailed").show();

    if(userAgent.transport.ReconnectionAttempts <= 0) return;

    window.setTimeout(function(){
        if(userAgent && userAgent.transport && userAgent.transport.state == SIP.TransportState.Disconnected){
            userAgent.reconnect().catch(function(error){
                console.warn("Failed to reconnect", error);
                onTransportConnectError(error);
            });
        }
    }, TransportReconnectionTimeout * 1000);
    console.log("Waiting to Re-connect...", TransportReconnectionTimeout, "Attempt remaining", userAgent.transport.ReconnectionAttempts);
    userAgent.transport.ReconnectionAttempts = userAgent.transport.ReconnectionAttempts - 1;

    // Custom Web hook
    if(typeof web_hook_on_transportError !== 'undefined') web_hook_on_transportError(userAgent.transport, userAgent);
}
function onTransportDisconnected(){
    console.log("Disconnected!");

    if(userAgent && userAgent.registerer && userAgent.registerer.state == SIP.RegistererState.Registered) {
        userAgent.registerer.unregister().catch(function(){
            // This will fail because the transport is down
            // But we need this so that it can register again
        });
    }
    userAgent.isReRegister = false;
}

/* Registration 
================== */
function Register() {
    if (userAgent == null || userAgent.isRegistered()) return;

    var RegistererRegisterOptions = {
        requestDelegate: {
            onReject: function(sip){
                onRegisterFailed(sip.message.reasonPhrase, sip.message.statusCode);
            }
        }
    }

    console.log("Sending Registration...");
    $("#regStatus").html(lang.sending_registration);
    userAgent.registerer.register(RegistererRegisterOptions);
}
function Unregister() {
    if (userAgent == null || !userAgent.isRegistered()) return;

    console.log("Unsubscribing...");
    $("#regStatus").html(lang.unsubscribing);
    try {
        UnsubscribeAll();
    } catch (e) { }

    console.log("Disconnecting...");
    $("#regStatus").html(lang.disconnecting);
    userAgent.registerer.unregister();

    userAgent.isReRegister = false;
}

/* Registration Events
=========================
- Called after account has been registered with
*/
function onRegistered(){
    // This code fires on re-register after session timeout
    // to ensure that events are not fired multiple times
    // and the re-register state is kept.

    userAgent.registrationCompleted = true;
    if(!userAgent.isReRegister) {
        console.log("Registered!");

        $("#reglink").hide();
        $("#dereglink").show();
        if(DoNotDisturbEnabled || DoNotDisturbPolicy == "enabled") {
            $("#dereglink").attr("class", "dotDoNotDisturb");
        }

        // Start Subscribe Loop
        window.setTimeout(function (){
            SubscribeAll();
        }, 500);

        // Output to status
        $("#regStatus").html(lang.registered);

        // Close any window that may be open
        CloseWindow(true);

        // Custom Web hook
        if(typeof web_hook_on_register !== 'undefined') web_hook_on_register(userAgent);
    }
    else {
        console.log("ReRegistered!");
    }
    userAgent.isReRegister = true;
}
/* Called if UserAgent can connect but not registered
 @param {string} response = Incoming request message
 @param {string} cause = cause message. Unused
*/
function onRegisterFailed(response, cause){
    console.log("Registration Failed: " + response);
    $("#regStatus").html(lang.registration_failed);

    $("#reglink").show();
    $("#dereglink").hide();

    Alert(lang.registration_failed +":"+ response, lang.registration_failed);

    // Custom Web hook
    if(typeof web_hook_on_registrationFailed !== 'undefined') web_hook_on_registrationFailed(response);
}
function onRegisterFailed(response, cause){
    console.log("Registration Failed: " + response);
    $("#regStatus").html(lang.registration_failed);

    $("#reglink").show();
    $("#dereglink").hide();

    Alert(lang.registration_failed +":"+ response, lang.registration_failed);

    // Custom Web hook
    if(typeof web_hook_on_registrationFailed !== 'undefined') web_hook_on_registrationFailed(response);
}
// Called when un-registrating
function onUnregistered(){
    if(userAgent.registrationCompleted){
        console.log("Unregistered, bye!");
        $("#regStatus").html(lang.unregistered);

        $("#reglink").show();
        $("#dereglink").hide();

        // Custom Web hook
        if(typeof web_hook_on_unregistered !== 'undefined') web_hook_on_unregistered();
    }
    else {
        // Was never really rejistered, so cant really say unregistered
    }

    // We set this flag here so that the re-register attepts are fully completed.
    userAgent.isReRegister = false;
}

/* Inbound Calls 
=================== */
function ReceiveCall(session) {
    var callerID = session.remoteIdentity.displayName;
    var did = session.remoteIdentity.uri.user;

    console.log("New Incoming Call!", callerID +" <"+ did +">");

    var CurrentCalls = countSessions(session.id);
    console.log("Current Call Count:", CurrentCalls);

    var buddyObj = FindBuddyByDid(did);
    // Make new contact of its not there
    if(buddyObj == null) {

        // Check if Privacy DND is enabled

        var buddyType = (did.length > DidLength)? "contact" : "extension";
        var focusOnBuddy = (CurrentCalls==0);
        buddyObj = MakeBuddy(buddyType, true, focusOnBuddy, false, callerID, did, null, false);
    }
    else {
        // Double check that the buddy has the same caller ID as the incoming call
        // With Buddies that are contacts, eg +441234567890 <+441234567890> leave as as
        if(buddyObj.type == "extension" && buddyObj.CallerIDName != callerID){
            UpdateBuddyCalerID(buddyObj, callerID);
        }
        else if(buddyObj.type == "contact" && callerID != did && buddyObj.CallerIDName != callerID){
            UpdateBuddyCalerID(buddyObj, callerID);
        }
    }

    var startTime = moment.utc();

    // Create the line and add the session so we can answer or reject it.
    newLineNumber = newLineNumber + 1;
    var lineObj = new Line(newLineNumber, callerID, did, buddyObj);
    lineObj.SipSession = session;
    lineObj.SipSession.data = {}
    lineObj.SipSession.data.line = lineObj.LineNumber;
    lineObj.SipSession.data.calldirection = "inbound";
    lineObj.SipSession.data.terminateby = "";
    lineObj.SipSession.data.buddyId = lineObj.BuddyObj.identity;
    lineObj.SipSession.data.callstart = startTime.format("YYYY-MM-DD HH:mm:ss UTC");
    lineObj.SipSession.data.callTimer = window.setInterval(function(){
        var now = moment.utc();
        var duration = moment.duration(now.diff(startTime)); 
        $("#line-" + lineObj.LineNumber + "-timer").html(formatShortDuration(duration.asSeconds()));
    }, 1000);
    lineObj.SipSession.data.earlyReject = false;
    Lines.push(lineObj);
    //Detect Invite
    lineObj.SipSession.data = false;
    var callInvite = false;
    if(lineObj.SipSession.request.body.indexOf("m=audio") > -1) {
        callInvite = true;
        if (buddyObj.type === "contact"){
            callInvite = false;
        } 
    }
    // Session Delegate
    lineObj.SipSession.delegate = {
        onBye: function(sip){
            onSessionRecievedBye(lineObj, sip)
        },
        
        onInvite: function(sip){
            onSessionReinvited(lineObj, sip);
        }
    }
    // Invite Request Delegate
    lineObj.SipSession.incomingInviteRequest.delegate = {
        onCancel: function(sip){
            onInviteCancel(lineObj, sip)
        }
    }
    // Rejct Invite Options
    if(DoNotDisturbEnabled == true || DoNotDisturbPolicy == "enabled") {
        if(DoNotDisturbEnabled == true && buddyObj.EnableDuringDnd == true){
            // This buddy has been allowed 
            console.log("Buddy is allowed to call while you are on DND")
        }
        else {
            console.log("Do Not Disturb Enabled, rejecting call.");
            lineObj.SipSession.data.earlyReject = true;
            RejectCall(lineObj.LineNumber, true);
            return;
        }
    }
    if(CurrentCalls >= 1){
        if(CallWaitingEnabled == false || CallWaitingEnabled == "disabled"){
            console.log("Call Waiting Disabled, rejecting call.");
            lineObj.SipSession.data.earlyReject = true;
            RejectCall(lineObj.LineNumber, true);
            return;
        }
    }
    // Call Creation 
    AddLineHtml(lineObj);
    $("#line-" + lineObj.LineNumber + "-msg").html(lang.incoming_call_from +" " + callerID +" &lt;"+ did +"&gt;");
    $("#line-" + lineObj.LineNumber + "-msg").show();
    $("#line-" + lineObj.LineNumber + "-timer").show();
    if(Invite){
        $("#line-"+ lineObj.LineNumber +"-answer").hide();
    }
    $("#line-" + lineObj.LineNumber + "-AnswerCall").show();

    UpdateBuddyList();

    //Display Notifications
    if ("Notification" in window) {
        if (Notification.permission === "granted") {
            var noticeOptions = { body: lang.incoming_call_from +" " + callerID +" <"+ did +">", icon: getPicture(buddyObj.identity) }
            var inComingCallNotification = new Notification(lang.incoming_call, noticeOptions);
            inComingCallNotification.onclick = function (event) {

                var lineNo = lineObj.LineNumber;
                window.setTimeout(function(){
                    if(Invite) {
                        AnswerAudioCall(lineNo);
                    }
                }, 1000);
                SelectLine(lineNo);
                return;
            }
        }
    }

    // Ring Tone & Alert
    if(CurrentCalls >= 1){
        // Play Alert
        console.log("Audio:", audioBlobs.CallWaiting.url);
        var rinnger = new Audio(audioBlobs.CallWaiting.blob);
        rinnger.preload = "auto";
        rinnger.loop = false;
        rinnger.oncanplaythrough = function(e) {
            if (typeof rinnger.sinkId !== 'undefined' && getRingerOutputID() != "default") {
                rinnger.setSinkId(getRingerOutputID()).then(function() {
                    console.log("Set sinkId to:", getRingerOutputID());
                }).catch(function(e){
                    console.warn("Failed not apply setSinkId.", e);
                });
            }
            rinnger.play().then(function(){
            }).catch(function(e){
                console.warn("Unable to play audio file.", e);
            }); 
        }
        lineObj.SipSession.data.rinngerObj = rinnger;
    } else {
        // Play Ring Tone
        console.log("Audio:", audioBlobs.Ringtone.url);
        var rinnger = new Audio(audioBlobs.Ringtone.blob);
        rinnger.preload = "auto";
        rinnger.loop = true;
        rinnger.oncanplaythrough = function(e) {
            if (typeof rinnger.sinkId !== 'undefined' && getRingerOutputID() != "default") {
                rinnger.setSinkId(getRingerOutputID()).then(function() {
                    console.log("Set sinkId to:", getRingerOutputID());
                }).catch(function(e){
                    console.warn("Failed not apply setSinkId.", e);
                });
            }
            rinnger.play().then(function(){
            }).catch(function(e){
                console.warn("Unable to play audio file.", e);
            }); 
        }
        lineObj.SipSession.data.rinngerObj = rinnger;
    }

    //Check if line is busy
    var streamVisible = $("#stream-"+ buddyObj.identity).is(":visible");
    if (streamVisible || CurrentCalls == 0) {
        // If you are already on the selected buddy who is now calling you, switch to his call.
        if(CurrentCalls == 0) SelectLine(newLineNumber);
    }
    else if(ShowCallAnswerWindow){
        CloseWindow();
        // Show Call Answer Window
        var callAnswerHtml = "<div class=\"UiWindowField\" style=\"text-align:center\">"
        callAnswerHtml += "<div style=\"font-size: 18px; margin-top:05px\">"+ callerID + "<div>";
        if(callerID != did) {
            callAnswerHtml += "<div style=\"font-size: 18px; margin-top:05px\">&lt;"+ did + "&gt;<div>";
        }
        callAnswerHtml += "<div class=callAnswerBuddyIcon style=\"background-image: url("+ getPicture(buddyObj.identity) +"); margin-top:15px\"></div>";
        callAnswerHtml += "<div style=\"margin-top:5px\"><button onclick=\"AnswerAudioCall('"+ buddyObj.identity +"')\" class=answerButton><i class=\"fa fa-phone\"></i> "+ lang.answer_call +"</button></div>";
        if(callInvite) {
            callAnswerHtml += "<div style=\"margin-top:15px\"><button onclick=\"AnswerCall('"+ buddyObj.identity +"')\></i> "+ lang.answer_call +"</button></div>";
        }
        callAnswerHtml += "</div>";
        OpenWindow(callAnswerHtml, lang.incoming_call_from, 400, 300, true, false, lang.reject_call, function(){
            // Reject the call
            RejectCall(buddyObj.identity);
            CloseWindow();
        }, "Close", function(){
            // Let it ring
            CloseWindow();
        }, null, null);
    }

    if(typeof web_hook_on_invite !== 'undefined') web_hook_on_invite(session);

}

function AnswerAudioCall(lineNumber) {
    // CloseWindow();

    var lineObj = FindLineByNumber(lineNumber);
    if(lineObj == null){
        console.warn("Failed to get line ("+ lineNumber +")");
        return;
    }
    var session = lineObj.SipSession;
    // Stop the ringtone
    if(session.data.rinngerObj){
        session.data.rinngerObj.pause();
        session.data.rinngerObj.removeAttribute('src');
        session.data.rinngerObj.load();
        session.data.rinngerObj = null;
    }
    // Check vitals
    if(HasAudioDevice == false){
        Alert(lang.alert_no_microphone);
        $("#line-" + lineObj.LineNumber + "-msg").html(lang.call_failed);
        $("#line-" + lineObj.LineNumber + "-AnswerCall").hide();
        return;
    }

    // Update UI
    $("#line-" + lineObj.LineNumber + "-AnswerCall").hide();

    // Start SIP handling
    var supportedConstraints = navigator.mediaDevices.getSupportedConstraints();
    var spdOptions = {
        sessionDescriptionHandlerOptions: {
            constraints: {
                audio: { deviceId : "default" },
                //video: false
            }
        }
    }

    // Configure Audio
    var currentAudioDevice = getAudioSrcID();
    if(currentAudioDevice != "default"){
        var confirmedAudioDevice = false;
        for (var i = 0; i < AudioinputDevices.length; ++i) {
            if(currentAudioDevice == AudioinputDevices[i].deviceId) {
                confirmedAudioDevice = true;
                break;
            }
        }
        if(confirmedAudioDevice) {
            spdOptions.sessionDescriptionHandlerOptions.constraints.audio.deviceId = { exact: currentAudioDevice }
        }
        else {
            console.warn("The audio device you used before is no longer available, default settings applied.");
            localDB.setItem("AudioSrcId", "default");
        }
    }
    // Add additional Constraints
    if(supportedConstraints.autoGainControl) {
        spdOptions.sessionDescriptionHandlerOptions.constraints.audio.autoGainControl = AutoGainControl;
    }
    if(supportedConstraints.echoCancellation) {
        spdOptions.sessionDescriptionHandlerOptions.constraints.audio.echoCancellation = EchoCancellation;
    }
    if(supportedConstraints.noiseSuppression) {
        spdOptions.sessionDescriptionHandlerOptions.constraints.audio.noiseSuppression = NoiseSuppression;
    }

    // Save Devices
    lineObj.SipSession.data.AudioSourceDevice = getAudioSrcID();
    lineObj.SipSession.data.AudioOutputDevice = getAudioOutputID();

    // Send Answer
    lineObj.SipSession.accept(spdOptions).then(function(){
        onInviteAccepted(lineObj,false);
    }).catch(function(error){
        console.warn("Failed to answer call", error, lineObj.SipSession);
        lineObj.SipSession.data.reasonCode = 500;
        lineObj.SipSession.data.reasonText = "Client Error";
        teardownSession(lineObj);
    });
}

// Reject call
function RejectCall(lineNumber) {
    var lineObj = FindLineByNumber(lineNumber);
    if (lineObj == null) {
        console.warn("Unable to find line ("+ lineNumber +")");
        return;
    }
    var session = lineObj.SipSession;
    if (session == null) {
        console.warn("Reject failed, null session");
        $("#line-" + lineObj.LineNumber + "-msg").html(lang.call_failed);
        $("#line-" + lineObj.LineNumber + "-AnswerCall").hide();
    }
    if(session.state == SIP.SessionState.Established){
        session.bye().catch(function(e){
            console.warn("Problem in RejectCall(), could not bye() call", e, session);
        });
    }
    else {
        session.reject({ 
            statusCode: 486, 
            reasonPhrase: "Busy Here" 
        }).catch(function(e){
            console.warn("Problem in RejectCall(), could not reject() call", e, session);
        });
    }
    $("#line-" + lineObj.LineNumber + "-msg").html(lang.call_rejected);

    session.data.terminateby = "us";
    session.data.reasonCode = 486;
    session.data.reasonText = "Busy Here";
    teardownSession(lineObj);
}

/* Session Events 
==================== */
// Incoming Invite
function onInviteCancel(lineObj, response){
    // Remote Party Cancelled Call Early
    console.log("Call canceled by remote party before answer");

    lineObj.SipSession.data.terminateby = "them";
    lineObj.SipSession.data.reasonCode = 0;
    lineObj.SipSession.data.reasonText = "Call Cancelled";

    lineObj.SipSession.dispose().catch(function(error){
        console.log("Failed to dispose the cancel dialog", error);
    })

    teardownSession(lineObj);
}
// Incoming & Outgoing Invites
function onInviteAccepted(lineObj, response){
    //Call in progress
    var session = lineObj.SipSession;
    
    if(session.data.earlyMedia){
        session.data.earlyMedia.pause();
        session.data.earlyMedia.removeAttribute('src');
        session.data.earlyMedia.load();
        session.data.earlyMedia = null;
    }
    
    window.clearInterval(session.data.callTimer);
    $("#line-" + lineObj.LineNumber + "-timer").show();
    var startTime = moment.utc();
    session.data.startTime = startTime;
    session.data.callTimer = window.setInterval(function(){
        var now = moment.utc();
        var duration = moment.duration(now.diff(startTime)); 
        $("#line-" + lineObj.LineNumber + "-timer").html(formatShortDuration(duration.asSeconds()));
    }, 1000);
    session.isOnHold = false;

    updateLineScroll(lineObj.LineNumber);

    // Start Audio Monitoring
    lineObj.LocalSoundMeter = StartLocalAudioMediaMonitoring(lineObj.LineNumber, session);
    lineObj.RemoteSoundMeter = StartRemoteAudioMediaMonitoring(lineObj.LineNumber, session);

    $("#line-" + lineObj.LineNumber + "-msg").html(lang.call_in_progress);

    if(typeof web_hook_on_modify !== 'undefined') web_hook_on_modify("accepted", session);
}
// Outgoing Invite
function onInviteTrying(lineObj, response){
    $("#line-" + lineObj.LineNumber + "-msg").html(lang.trying);

    // Custom Web hook
    if(typeof web_hook_on_modify !== 'undefined') web_hook_on_modify("trying", response.message);
}
function onInviteProgress(lineObj, response){
    console.log("Call Progress:", response.message.statusCode);
    
    // response.message.reasonPhrase
    if(response.message.statusCode == 180){
        $("#line-" + lineObj.LineNumber + "-msg").html(lang.ringing);
        
        var soundFile = audioBlobs.EarlyMedia_European;
        if(UserLocale().indexOf("gb") > -1) soundFile = audioBlobs.EarlyMedia_UK;
        
        // Play Early Media
        console.log("Audio:", soundFile.url);
        if(lineObj.SipSession.data.earlyMedia){
            console.log("Early Media already playing");
        }
        else {
            var earlyMedia = new Audio(soundFile.blob);
            earlyMedia.preload = "auto";
            earlyMedia.loop = true;
            earlyMedia.oncanplaythrough = function(e) {
                if (typeof earlyMedia.sinkId !== 'undefined' && getAudioOutputID() != "default") {
                    earlyMedia.setSinkId(getAudioOutputID()).then(function() {
                        console.log("Set sinkId to:", getAudioOutputID());
                    }).catch(function(e){
                        console.warn("Failed not apply setSinkId.", e);
                    });
                }
                earlyMedia.play().then(function(){
                }).catch(function(e){
                    console.warn("Unable to play audio file.", e);
                }); 
            }
            lineObj.SipSession.data.earlyMedia = earlyMedia;
        }
    }
    else if(response.message.statusCode === 183){
        $("#line-" + lineObj.LineNumber + "-msg").html(response.message.reasonPhrase + "...");
    }
    else {
        // 181 = Call is Being Forwarded
        // 182 = Call is queued 
        // 199 = Call is Terminated
        $("#line-" + lineObj.LineNumber + "-msg").html(response.message.reasonPhrase + "...");
    }
    if(typeof web_hook_on_modify !== 'undefined') web_hook_on_modify("progress", response);
}

function onInviteRejected(lineObj, response){
    console.log("INVITE Rejected:", response.message.reasonPhrase);

    lineObj.SipSession.data.terminateby = "them";
    lineObj.SipSession.data.reasonCode = response.message.statusCode;
    lineObj.SipSession.data.reasonText = response.message.reasonPhrase;

    teardownSession(lineObj);
}
function onInviteRedirected(response){
    console.log("onInviteRedirected", response);
}
// General Sessoin delegates
function onSessionRecievedBye(lineObj, response){
    // They Ended the call
    $("#line-" + lineObj.LineNumber + "-msg").html(lang.call_ended);
    console.log("Call ended, bye!");

    lineObj.SipSession.data.terminateby = "them";
    lineObj.SipSession.data.reasonCode = 16;
    lineObj.SipSession.data.reasonText = "Normal Call clearing";

    teardownSession(lineObj);
}

/* End Session
================= */
function teardownSession(lineObj) {
    if(lineObj == null || lineObj.SipSession == null) return;

    var session = lineObj.SipSession;
    if(session.data.teardownComplete == true) return;
    session.data.teardownComplete = true;

    // Call UI
    if(session.data.earlyReject != true){
        HidePopup();
    }

    // End any child calls
    if(session.data.childsession){
        session.data.childsession.dispose().then(function(){
            session.data.childsession = null;
        }).catch(function(error){
            session.data.childsession = null;
        });
    }

    // Mixed Tracks
    if(session.data.AudioSourceTrack && session.data.AudioSourceTrack.kind == "audio"){
        session.data.AudioSourceTrack.stop();
        session.data.AudioSourceTrack = null;
    }

    // Stop any Early Media
    if(session.data.earlyMedia){
        session.data.earlyMedia.pause();
        session.data.earlyMedia.removeAttribute('src');
        session.data.earlyMedia.load();
        session.data.earlyMedia = null;
    }

    // Stop any ringing calls
    if(session.data.rinngerObj){
        session.data.rinngerObj.pause();
        session.data.rinngerObj.removeAttribute('src');
        session.data.rinngerObj.load();
        session.data.rinngerObj = null;
    }

    // Audio Meters
    if(lineObj.LocalSoundMeter != null){
        lineObj.LocalSoundMeter.stop();
        lineObj.LocalSoundMeter = null;
    }
    if(lineObj.RemoteSoundMeter != null){
        lineObj.RemoteSoundMeter.stop();
        lineObj.RemoteSoundMeter = null;
    }

    // Make sure you have released the microphone
    if(session && session.sessionDescriptionHandler && session.sessionDescriptionHandler.peerConnection){
        var pc = session.sessionDescriptionHandler.peerConnection;
        pc.getSenders().forEach(function (RTCRtpSender) {
            if(RTCRtpSender.track && RTCRtpSender.track.kind == "audio") {
                RTCRtpSender.track.stop();
            }
        });
    }

    // End timers
    //window.clearInterval(session.data.videoResampleInterval);
    window.clearInterval(session.data.callTimer);

    // Add to stream
    AddCallMessage(lineObj.BuddyObj.identity, session);

    // Check if this call was missed
    if(session.data.calldirection == "inbound" && session.data.terminateby == "them" && lineObj.SipSession.data.startTime == null){
        IncreaseMissedBadge(session.data.buddyId);
    }
    
    // Close up the UI
    window.setTimeout(function () {
        RemoveLine(lineObj);
    }, 1000);

    UpdateBuddyList();
    if(session.data.earlyReject != true){
        UpdateUI();
    }

    // Custom Web hook
    if(typeof web_hook_on_terminate !== 'undefined') web_hook_on_terminate(session);
}

/* Microphone & Speakers
=========================== */
function StartRemoteAudioMediaMonitoring(lineNum, session) {
    console.log("Creating RemoteAudio AudioContext on Line:" + lineNum);

    // Create Local SoundMeter
    var soundMeter = new SoundMeter(session.id, lineNum);
    if(soundMeter == null){
        console.warn("AudioContext() RemoteAudio not available... it fine.");
        return null;
    }

    // Ready the getStats request
    var remoteAudioStream = new MediaStream();
    var audioReceiver = null;
    var pc = session.sessionDescriptionHandler.peerConnection;
    pc.getReceivers().forEach(function (RTCRtpReceiver) {
        if(RTCRtpReceiver.track && RTCRtpReceiver.track.kind == "audio"){
            if(audioReceiver == null) {
                remoteAudioStream.addTrack(RTCRtpReceiver.track);
                audioReceiver = RTCRtpReceiver;
            }
            else {
                console.log("Found another Track, but audioReceiver not null");
                console.log(RTCRtpReceiver);
                console.log(RTCRtpReceiver.track);
            }
        }
    });

    // Setup Charts
    var maxDataLength = 100;
    soundMeter.startTime = Date.now();
    Chart.defaults.global.defaultFontSize = 12;

    var ChatHistoryOptions = { 
        responsive: false,
        maintainAspectRatio: false,
        devicePixelRatio: 1,
        animation: false,
        scales: {
            yAxes: [{
                ticks: { beginAtZero: true } //, min: 0, max: 100
            }]
        }, 
    }

    // Receive Kilobits per second
    soundMeter.ReceiveBitRateChart = new Chart($("#line-"+ lineNum +"-AudioReceiveBitRate"), {
        type: 'line',
        data: {
            labels: MakeDataArray("", maxDataLength),
            datasets: [{
                label: lang.receive_kilobits_per_second,
                data: MakeDataArray(0, maxDataLength),
                backgroundColor: 'rgba(168, 0, 0, 0.5)',
                borderColor: 'rgba(168, 0, 0, 1)',
                borderWidth: 1,
                pointRadius: 1
            }]
        },
        options: ChatHistoryOptions
    });
    soundMeter.ReceiveBitRateChart.lastValueBytesReceived = 0;
    soundMeter.ReceiveBitRateChart.lastValueTimestamp = 0;

    // Receive Packets per second
    soundMeter.ReceivePacketRateChart = new Chart($("#line-"+ lineNum +"-AudioReceivePacketRate"), {
        type: 'line',
        data: {
            labels: MakeDataArray("", maxDataLength),
            datasets: [{
                label: lang.receive_packets_per_second,
                data: MakeDataArray(0, maxDataLength),
                backgroundColor: 'rgba(168, 0, 0, 0.5)',
                borderColor: 'rgba(168, 0, 0, 1)',
                borderWidth: 1,
                pointRadius: 1
            }]
        },
        options: ChatHistoryOptions
    });
    soundMeter.ReceivePacketRateChart.lastValuePacketReceived = 0;
    soundMeter.ReceivePacketRateChart.lastValueTimestamp = 0;

    // Receive Packet Loss
    soundMeter.ReceivePacketLossChart = new Chart($("#line-"+ lineNum +"-AudioReceivePacketLoss"), {
        type: 'line',
        data: {
            labels: MakeDataArray("", maxDataLength),
            datasets: [{
                label: lang.receive_packet_loss,
                data: MakeDataArray(0, maxDataLength),
                backgroundColor: 'rgba(168, 99, 0, 0.5)',
                borderColor: 'rgba(168, 99, 0, 1)',
                borderWidth: 1,
                pointRadius: 1
            }]
        },
        options: ChatHistoryOptions
    });
    soundMeter.ReceivePacketLossChart.lastValuePacketLoss = 0;
    soundMeter.ReceivePacketLossChart.lastValueTimestamp = 0;

    // Receive Jitter
    soundMeter.ReceiveJitterChart = new Chart($("#line-"+ lineNum +"-AudioReceiveJitter"), {
        type: 'line',
        data: {
            labels: MakeDataArray("", maxDataLength),
            datasets: [{
                label: lang.receive_jitter,
                data: MakeDataArray(0, maxDataLength),
                backgroundColor: 'rgba(0, 38, 168, 0.5)',
                borderColor: 'rgba(0, 38, 168, 1)',
                borderWidth: 1,
                pointRadius: 1
            }]
        },
        options: ChatHistoryOptions
    });

    // Receive Audio Levels
    soundMeter.ReceiveLevelsChart = new Chart($("#line-"+ lineNum +"-AudioReceiveLevels"), {
        type: 'line',
        data: {
            labels: MakeDataArray("", maxDataLength),
            datasets: [{
                label: lang.receive_audio_levels,
                data: MakeDataArray(0, maxDataLength),
                backgroundColor: 'rgba(140, 0, 168, 0.5)',
                borderColor: 'rgba(140, 0, 168, 1)',
                borderWidth: 1,
                pointRadius: 1
            }]
        },
        options: ChatHistoryOptions
    });

    // Connect to Source
    soundMeter.connectToSource(remoteAudioStream, function (e) {
        if (e != null) return;

        // Create remote SoundMeter
        console.log("SoundMeter for RemoteAudio Connected, displaying levels for Line: " + lineNum);
        soundMeter.levelsInterval = window.setInterval(function () {
            //Calculate Levels (0 - 255)
            var instPercent = (soundMeter.instant/255) * 100;
            $("#line-" + lineNum + "-Speaker").css("height", instPercent.toFixed(2) +"%");
        }, 50);
        soundMeter.networkInterval = window.setInterval(function (){
            // Calculate Network Conditions
            if(audioReceiver != null) {
                audioReceiver.getStats().then(function(stats) {
                    stats.forEach(function(report){

                        var theMoment = utcDateNow();
                        var ReceiveBitRateChart = soundMeter.ReceiveBitRateChart;
                        var ReceivePacketRateChart = soundMeter.ReceivePacketRateChart;
                        var ReceivePacketLossChart = soundMeter.ReceivePacketLossChart;
                        var ReceiveJitterChart = soundMeter.ReceiveJitterChart;
                        var ReceiveLevelsChart = soundMeter.ReceiveLevelsChart;
                        var elapsedSec = Math.floor((Date.now() - soundMeter.startTime)/1000);

                        if(report.type == "inbound-rtp"){

                            if(ReceiveBitRateChart.lastValueTimestamp == 0) {
                                ReceiveBitRateChart.lastValueTimestamp = report.timestamp;
                                ReceiveBitRateChart.lastValueBytesReceived = report.bytesReceived;

                                ReceivePacketRateChart.lastValueTimestamp = report.timestamp;
                                ReceivePacketRateChart.lastValuePacketReceived = report.packetsReceived;

                                ReceivePacketLossChart.lastValueTimestamp = report.timestamp;
                                ReceivePacketLossChart.lastValuePacketLoss = report.packetsLost;

                                return;
                            }
                            // Receive Kilobits Per second
                            var kbitsPerSec = (8 * (report.bytesReceived - ReceiveBitRateChart.lastValueBytesReceived))/1000;

                            ReceiveBitRateChart.lastValueTimestamp = report.timestamp;
                            ReceiveBitRateChart.lastValueBytesReceived = report.bytesReceived;

                            soundMeter.ReceiveBitRate.push({ value: kbitsPerSec, timestamp : theMoment});
                            ReceiveBitRateChart.data.datasets[0].data.push(kbitsPerSec);
                            ReceiveBitRateChart.data.labels.push("");
                            if(ReceiveBitRateChart.data.datasets[0].data.length > maxDataLength) {
                                ReceiveBitRateChart.data.datasets[0].data.splice(0,1);
                                ReceiveBitRateChart.data.labels.splice(0,1);
                            }
                            ReceiveBitRateChart.update();

                            // Receive Packets Per Second
                            var PacketsPerSec = (report.packetsReceived - ReceivePacketRateChart.lastValuePacketReceived);

                            ReceivePacketRateChart.lastValueTimestamp = report.timestamp;
                            ReceivePacketRateChart.lastValuePacketReceived = report.packetsReceived;

                            soundMeter.ReceivePacketRate.push({ value: PacketsPerSec, timestamp : theMoment});
                            ReceivePacketRateChart.data.datasets[0].data.push(PacketsPerSec);
                            ReceivePacketRateChart.data.labels.push("");
                            if(ReceivePacketRateChart.data.datasets[0].data.length > maxDataLength) {
                                ReceivePacketRateChart.data.datasets[0].data.splice(0,1);
                                ReceivePacketRateChart.data.labels.splice(0,1);
                            }
                            ReceivePacketRateChart.update();

                            // Receive Packet Loss
                            var PacketsLost = (report.packetsLost - ReceivePacketLossChart.lastValuePacketLoss);

                            ReceivePacketLossChart.lastValueTimestamp = report.timestamp;
                            ReceivePacketLossChart.lastValuePacketLoss = report.packetsLost;

                            soundMeter.ReceivePacketLoss.push({ value: PacketsLost, timestamp : theMoment});
                            ReceivePacketLossChart.data.datasets[0].data.push(PacketsLost);
                            ReceivePacketLossChart.data.labels.push("");
                            if(ReceivePacketLossChart.data.datasets[0].data.length > maxDataLength) {
                                ReceivePacketLossChart.data.datasets[0].data.splice(0,1);
                                ReceivePacketLossChart.data.labels.splice(0,1);
                            }
                            ReceivePacketLossChart.update();

                            // Receive Jitter
                            soundMeter.ReceiveJitter.push({ value: report.jitter, timestamp : theMoment});
                            ReceiveJitterChart.data.datasets[0].data.push(report.jitter);
                            ReceiveJitterChart.data.labels.push("");
                            if(ReceiveJitterChart.data.datasets[0].data.length > maxDataLength) {
                                ReceiveJitterChart.data.datasets[0].data.splice(0,1);
                                ReceiveJitterChart.data.labels.splice(0,1);
                            }
                            ReceiveJitterChart.update();
                        }
                        if(report.type == "track") {

                            // Receive Audio Levels
                            var levelPercent = (report.audioLevel * 100);
                            soundMeter.ReceiveLevels.push({ value: levelPercent, timestamp : theMoment});
                            ReceiveLevelsChart.data.datasets[0].data.push(levelPercent);
                            ReceiveLevelsChart.data.labels.push("");
                            if(ReceiveLevelsChart.data.datasets[0].data.length > maxDataLength)
                            {
                                ReceiveLevelsChart.data.datasets[0].data.splice(0,1);
                                ReceiveLevelsChart.data.labels.splice(0,1);
                            }
                            ReceiveLevelsChart.update();
                        }
                    });
                });
            }
        } ,1000);
    });

    return soundMeter;
}

function StartLocalAudioMediaMonitoring(lineNum, session) {
    console.log("Creating LocalAudio AudioContext on line " + lineNum);

    // Create local SoundMeter
    var soundMeter = new SoundMeter(session.id, lineNum);
    if(soundMeter == null){
        console.warn("AudioContext() LocalAudio not available... its fine.")
        return null;
    }

    // Ready the getStats request
    var localAudioStream = new MediaStream();
    var audioSender = null;
    var pc = session.sessionDescriptionHandler.peerConnection;
    pc.getSenders().forEach(function (RTCRtpSender) {
        if(RTCRtpSender.track && RTCRtpSender.track.kind == "audio"){
            if(audioSender == null){
                console.log("Adding Track to Monitor: ", RTCRtpSender.track.label);
                localAudioStream.addTrack(RTCRtpSender.track);
                audioSender = RTCRtpSender;
            }
            else {
                console.log("Found another Track, but audioSender not null");
                console.log(RTCRtpSender);
                console.log(RTCRtpSender.track);
            }
        }
    });

    // Setup Charts
    var maxDataLength = 100;
    soundMeter.startTime = Date.now();
    Chart.defaults.global.defaultFontSize = 12;
    var ChatHistoryOptions = { 
        responsive: false,    
        maintainAspectRatio: false,
        devicePixelRatio: 1,
        animation: false,
        scales: {
            yAxes: [{
                ticks: { beginAtZero: true }
            }]
        }, 
    }

    // Send Kilobits Per Second
    soundMeter.SendBitRateChart = new Chart($("#line-"+ lineNum +"-AudioSendBitRate"), {
        type: 'line',
        data: {
            labels: MakeDataArray("", maxDataLength),
            datasets: [{
                label: lang.send_kilobits_per_second,
                data: MakeDataArray(0, maxDataLength),
                backgroundColor: 'rgba(0, 121, 19, 0.5)',
                borderColor: 'rgba(0, 121, 19, 1)',
                borderWidth: 1,
                pointRadius: 1
            }]
        },
        options: ChatHistoryOptions
    });
    soundMeter.SendBitRateChart.lastValueBytesSent = 0;
    soundMeter.SendBitRateChart.lastValueTimestamp = 0;

    // Send Packets Per Second
    soundMeter.SendPacketRateChart = new Chart($("#line-"+ lineNum +"-AudioSendPacketRate"), {
        type: 'line',
        data: {
            labels: MakeDataArray("", maxDataLength),
            datasets: [{
                label: lang.send_packets_per_second,
                data: MakeDataArray(0, maxDataLength),
                backgroundColor: 'rgba(0, 121, 19, 0.5)',
                borderColor: 'rgba(0, 121, 19, 1)',
                borderWidth: 1,
                pointRadius: 1
            }]
        },
        options: ChatHistoryOptions
    });
    soundMeter.SendPacketRateChart.lastValuePacketSent = 0;
    soundMeter.SendPacketRateChart.lastValueTimestamp = 0;    

    // Connect to Source
    soundMeter.connectToSource(localAudioStream, function (e) {
        if (e != null) return;

        console.log("SoundMeter for LocalAudio Connected, displaying levels for Line: " + lineNum);
        soundMeter.levelsInterval = window.setInterval(function () {
            // Calculate Levels (0 - 255)
            var instPercent = (soundMeter.instant/255) * 100;
            $("#line-" + lineNum + "-Mic").css("height", instPercent.toFixed(2) +"%");
        }, 50);
        soundMeter.networkInterval = window.setInterval(function (){
            // Calculate Network Conditions
            // Sending Audio Track
            if(audioSender != null) {
                audioSender.getStats().then(function(stats) {
                    stats.forEach(function(report){

                        var theMoment = utcDateNow();
                        var SendBitRateChart = soundMeter.SendBitRateChart;
                        var SendPacketRateChart = soundMeter.SendPacketRateChart;
                        var elapsedSec = Math.floor((Date.now() - soundMeter.startTime)/1000);

                        if(report.type == "outbound-rtp"){
                            if(SendBitRateChart.lastValueTimestamp == 0) {
                                SendBitRateChart.lastValueTimestamp = report.timestamp;
                                SendBitRateChart.lastValueBytesSent = report.bytesSent;

                                SendPacketRateChart.lastValueTimestamp = report.timestamp;
                                SendPacketRateChart.lastValuePacketSent = report.packetsSent;
                                return;
                            }

                            // Send Kilobits Per second
                            var kbitsPerSec = (8 * (report.bytesSent - SendBitRateChart.lastValueBytesSent))/1000;

                            SendBitRateChart.lastValueTimestamp = report.timestamp;
                            SendBitRateChart.lastValueBytesSent = report.bytesSent;

                            soundMeter.SendBitRate.push({ value: kbitsPerSec, timestamp : theMoment});
                            SendBitRateChart.data.datasets[0].data.push(kbitsPerSec);
                            SendBitRateChart.data.labels.push("");
                            if(SendBitRateChart.data.datasets[0].data.length > maxDataLength) {
                                SendBitRateChart.data.datasets[0].data.splice(0,1);
                                SendBitRateChart.data.labels.splice(0,1);
                            }
                            SendBitRateChart.update();

                            // Send Packets Per Second
                            var PacketsPerSec = report.packetsSent - SendPacketRateChart.lastValuePacketSent;

                            SendPacketRateChart.lastValueTimestamp = report.timestamp;
                            SendPacketRateChart.lastValuePacketSent = report.packetsSent;

                            soundMeter.SendPacketRate.push({ value: PacketsPerSec, timestamp : theMoment});
                            SendPacketRateChart.data.datasets[0].data.push(PacketsPerSec);
                            SendPacketRateChart.data.labels.push("");
                            if(SendPacketRateChart.data.datasets[0].data.length > maxDataLength) {
                                SendPacketRateChart.data.datasets[0].data.splice(0,1);
                                SendPacketRateChart.data.labels.splice(0,1);
                            }
                            SendPacketRateChart.update();
                        }
                        if(report.type == "track") {
                            // Bug/security consern... this seems always to report "0"
                            // Possible reason: When applied to isolated streams, media metrics may allow an application to infer some characteristics of the isolated stream, such as if anyone is speaking (by watching the audioLevel statistic).
                            // console.log("Audio Sender: " + report.audioLevel);
                        }
                    });
                });
            }
        } ,1000);
    });

    return soundMeter;
}

/* Sound Meter Class
======================= */
class SoundMeter {
    constructor(sessionId, lineNum) {
        var audioContext = null;
        try {
            window.AudioContext = window.AudioContext || window.webkitAudioContext;
            audioContext = new AudioContext();
        }
        catch(e) {
            console.warn("AudioContext() LocalAudio not available... its fine.");
        }
        if (audioContext == null) return null;
        this.context = audioContext;
        this.source = null;

        this.lineNum = lineNum;
        this.sessionId = sessionId;

        this.captureInterval = null;
        this.levelsInterval = null;
        this.networkInterval = null;
        this.startTime = 0;

        this.ReceiveBitRateChart = null;
        this.ReceiveBitRate = [];
        this.ReceivePacketRateChart = null;
        this.ReceivePacketRate = [];
        this.ReceivePacketLossChart = null;
        this.ReceivePacketLoss = [];
        this.ReceiveJitterChart = null;
        this.ReceiveJitter = [];
        this.ReceiveLevelsChart = null;
        this.ReceiveLevels = [];
        this.SendBitRateChart = null;
        this.SendBitRate = [];
        this.SendPacketRateChart = null;
        this.SendPacketRate = [];

        this.instant = 0; // Primary Output indicator

        this.AnalyserNode = this.context.createAnalyser();
        this.AnalyserNode.minDecibels = -90;
        this.AnalyserNode.maxDecibels = -10;
        this.AnalyserNode.smoothingTimeConstant = 0.85;
    }
    connectToSource(stream, callback) {
        console.log("SoundMeter connecting...");
        try {
            this.source = this.context.createMediaStreamSource(stream);
            this.source.connect(this.AnalyserNode);
            // this.AnalyserNode.connect(this.context.destination); // Can be left unconnected
            this._start();

            callback(null);
        }
        catch(e) {
            console.error(e); // Probably not audio track
            callback(e);
        }
    }
    _start(){
        var self = this;
        self.instant = 0;
        self.AnalyserNode.fftSize = 32; // 32, 64, 128, 256, 512, 1024, 2048, 4096, 8192, 16384, and 32768. Defaults to 2048
        self.dataArray = new Uint8Array(self.AnalyserNode.frequencyBinCount);

        this.captureInterval = window.setInterval(function(){
            self.AnalyserNode.getByteFrequencyData(self.dataArray); // Populate array with data from 0-255

            // Just take the maximum value of this data
            self.instant = 0;
            for(var d = 0; d < self.dataArray.length; d++) {
                if(self.dataArray[d] > self.instant) self.instant = self.dataArray[d];
            }

        }, 1);
    }
    stop() {
        console.log("Disconnecting SoundMeter...");
        window.clearInterval(this.captureInterval);
        this.captureInterval = null;
        window.clearInterval(this.levelsInterval);
        this.levelsInterval = null;
        window.clearInterval(this.networkInterval);
        this.networkInterval = null;
        try {
            this.source.disconnect();
        }
        catch(e) { }
        this.source = null;
        try {
            this.AnalyserNode.disconnect();
        }
        catch(e) { }
        this.AnalyserNode = null;
        try {
            this.context.close();
        }
        catch(e) { }
        this.context = null;

        // Save to IndexDb
        var lineObj = FindLineByNumber(this.lineNum);
        var QosData = {
            ReceiveBitRate: this.ReceiveBitRate,
            ReceivePacketRate: this.ReceivePacketRate,
            ReceivePacketLoss: this.ReceivePacketLoss,
            ReceiveJitter: this.ReceiveJitter,
            ReceiveLevels: this.ReceiveLevels,
            SendBitRate: this.SendBitRate,
            SendPacketRate: this.SendPacketRate,
        }
        if(this.sessionId != null){
            SaveQosData(QosData, this.sessionId, lineObj.BuddyObj.identity);
        }
    }
}

/* Meter Settings Output
=========================== */
function MeterSettingsOutput(audioStream, objectId, direction, interval){
    var soundMeter = new SoundMeter(null, null);
    soundMeter.startTime = Date.now();
    soundMeter.connectToSource(audioStream, function (e) {
        if (e != null) return;

        console.log("SoundMeter Connected, displaying levels to:"+ objectId);
        soundMeter.levelsInterval = window.setInterval(function () {
            // Calculate Levels (0 - 255)
            var instPercent = (soundMeter.instant/255) * 100;
            $("#"+ objectId).css(direction, instPercent.toFixed(2) +"%");
        }, interval);
    });

    return soundMeter;
}

/* QOS
========= */
function SaveQosData(QosData, sessionId, buddy){
    var indexedDB = window.indexedDB;
    var request = indexedDB.open("CallQosData", 1);
    request.onerror = function(event) {
        console.error("IndexDB Request Error:", event);
    }
    request.onupgradeneeded = function(event) {
        console.warn("Upgrade Required for IndexDB... probably because of first time use.");
        var IDB = event.target.result;

        // Create Object Store
        if(IDB.objectStoreNames.contains("CallQos") == false){
            var objectStore = IDB.createObjectStore("CallQos", { keyPath: "uID" });
            objectStore.createIndex("sessionid", "sessionid", { unique: false });
            objectStore.createIndex("buddy", "buddy", { unique: false });
            objectStore.createIndex("QosData", "QosData", { unique: false });
        }
        else {
            console.warn("IndexDB requested upgrade, but object store was in place");
        }
    }
    request.onsuccess = function(event) {
        console.log("IndexDB connected to CallQosData");

        var IDB = event.target.result;
        if(IDB.objectStoreNames.contains("CallQos") == false){
            console.warn("IndexDB CallQosData.CallQos does not exists");
            IDB.close();
            window.indexedDB.deleteDatabase("CallQosData"); // This should help if the table structure has not been created.
            return;
        }
        IDB.onerror = function(event) {
            console.error("IndexDB Error:", event);
        }

        // Prepare data to write
        var data = {
            uID: uID(),
            sessionid: sessionId,
            buddy: buddy,
            QosData: QosData
        }
        // Commit Transaction
        var transaction = IDB.transaction(["CallQos"], "readwrite");
        var objectStoreAdd = transaction.objectStore("CallQos").add(data);
        objectStoreAdd.onsuccess = function(event) {
            console.log("Call CallQos Sucess: ", sessionId);
        }
    }
}
function DisplayQosData(sessionId){
    var indexedDB = window.indexedDB;
    var request = indexedDB.open("CallQosData", 1);
    request.onerror = function(event) {
        console.error("IndexDB Request Error:", event);
    }
    request.onupgradeneeded = function(event) {
        console.warn("Upgrade Required for IndexDB... probably because of first time use.");
    }
    request.onsuccess = function(event) {
        console.log("IndexDB connected to CallQosData");

        var IDB = event.target.result;
        if(IDB.objectStoreNames.contains("CallQos") == false){
            console.warn("IndexDB CallQosData.CallQos does not exists");
            return;
        } 

        var transaction = IDB.transaction(["CallQos"]);
        var objectStoreGet = transaction.objectStore("CallQos").index('sessionid').getAll(sessionId);
        objectStoreGet.onerror = function(event) {
            console.error("IndexDB Get Error:", event);
        }
        objectStoreGet.onsuccess = function(event) {
            if(event.target.result && event.target.result.length == 2){
                // This is the correct data

                var QosData0 = event.target.result[0].QosData;
                // ReceiveBitRate: (8) [{…}, {…}, {…}, {…}, {…}, {…}, {…}, {…}]
                // ReceiveJitter: (8) [{…}, {…}, {…}, {…}, {…}, {…}, {…}, {…}]
                // ReceiveLevels: (9) [{…}, {…}, {…}, {…}, {…}, {…}, {…}, {…}, {…}]
                // ReceivePacketLoss: (8) [{…}, {…}, {…}, {…}, {…}, {…}, {…}, {…}]
                // ReceivePacketRate: (8) [{…}, {…}, {…}, {…}, {…}, {…}, {…}, {…}]
                // SendBitRate: []
                // SendPacketRate: []
                var QosData1 = event.target.result[1].QosData;
                // ReceiveBitRate: []
                // ReceiveJitter: []
                // ReceiveLevels: []
                // ReceivePacketLoss: []
                // ReceivePacketRate: []
                // SendBitRate: (9) [{…}, {…}, {…}, {…}, {…}, {…}, {…}, {…}, {…}]
                // SendPacketRate: (9) [{…}, {…}, {…}, {…}, {…}, {…}, {…}, {…}, {…}]

                Chart.defaults.global.defaultFontSize = 12;

                var ChatHistoryOptions = { 
                    responsive: true,
                    maintainAspectRatio: false,
                    animation: false,
                    scales: {
                        yAxes: [{
                            ticks: { beginAtZero: true } //, min: 0, max: 100
                        }],
                        xAxes: [{
                            display: false
                        }]
                    }, 
                }

                // ReceiveBitRateChart
                var labelset = [];
                var dataset = [];
                var data = (QosData0.ReceiveBitRate.length > 0)? QosData0.ReceiveBitRate : QosData1.ReceiveBitRate;
                $.each(data, function(i,item){
                    labelset.push(moment.utc(item.timestamp.replace(" UTC", "")).local().format(DisplayDateFormat +" "+ DisplayTimeFormat));
                    dataset.push(item.value);
                });
                var ReceiveBitRateChart = new Chart($("#cdr-AudioReceiveBitRate"), {
                    type: 'line',
                    data: {
                        labels: labelset,
                        datasets: [{
                            label: lang.receive_kilobits_per_second,
                            data: dataset,
                            backgroundColor: 'rgba(168, 0, 0, 0.5)',
                            borderColor: 'rgba(168, 0, 0, 1)',
                            borderWidth: 1,
                            pointRadius: 1
                        }]
                    },
                    options: ChatHistoryOptions
                });

                // ReceivePacketRateChart
                var labelset = [];
                var dataset = [];
                var data = (QosData0.ReceivePacketRate.length > 0)? QosData0.ReceivePacketRate : QosData1.ReceivePacketRate;
                $.each(data, function(i,item){
                    labelset.push(moment.utc(item.timestamp.replace(" UTC", "")).local().format(DisplayDateFormat +" "+ DisplayTimeFormat));
                    dataset.push(item.value);
                });
                var ReceivePacketRateChart = new Chart($("#cdr-AudioReceivePacketRate"), {
                    type: 'line',
                    data: {
                        labels: labelset,
                        datasets: [{
                            label: lang.receive_packets_per_second,
                            data: dataset,
                            backgroundColor: 'rgba(168, 0, 0, 0.5)',
                            borderColor: 'rgba(168, 0, 0, 1)',
                            borderWidth: 1,
                            pointRadius: 1
                        }]
                    },
                    options: ChatHistoryOptions
                });

                // AudioReceivePacketLossChart
                var labelset = [];
                var dataset = [];
                var data = (QosData0.ReceivePacketLoss.length > 0)? QosData0.ReceivePacketLoss : QosData1.ReceivePacketLoss;
                $.each(data, function(i,item){
                    labelset.push(moment.utc(item.timestamp.replace(" UTC", "")).local().format(DisplayDateFormat +" "+ DisplayTimeFormat));
                    dataset.push(item.value);
                });
                var AudioReceivePacketLossChart = new Chart($("#cdr-AudioReceivePacketLoss"), {
                    type: 'line',
                    data: {
                        labels: labelset,
                        datasets: [{
                            label: lang.receive_packet_loss,
                            data: dataset,
                            backgroundColor: 'rgba(168, 99, 0, 0.5)',
                            borderColor: 'rgba(168, 99, 0, 1)',
                            borderWidth: 1,
                            pointRadius: 1
                        }]
                    },
                    options: ChatHistoryOptions
                });

                // AudioReceiveJitterChart
                var labelset = [];
                var dataset = [];
                var data = (QosData0.ReceiveJitter.length > 0)? QosData0.ReceiveJitter : QosData1.ReceiveJitter;
                $.each(data, function(i,item){
                    labelset.push(moment.utc(item.timestamp.replace(" UTC", "")).local().format(DisplayDateFormat +" "+ DisplayTimeFormat));
                    dataset.push(item.value);
                });
                var AudioReceiveJitterChart = new Chart($("#cdr-AudioReceiveJitter"), {
                    type: 'line',
                    data: {
                        labels: labelset,
                        datasets: [{
                            label: lang.receive_jitter,
                            data: dataset,
                            backgroundColor: 'rgba(0, 38, 168, 0.5)',
                            borderColor: 'rgba(0, 38, 168, 1)',
                            borderWidth: 1,
                            pointRadius: 1
                        }]
                    },
                    options: ChatHistoryOptions
                });
                
                // AudioReceiveLevelsChart
                var labelset = [];
                var dataset = [];
                var data = (QosData0.ReceiveLevels.length > 0)? QosData0.ReceiveLevels : QosData1.ReceiveLevels;
                $.each(data, function(i,item){
                    labelset.push(moment.utc(item.timestamp.replace(" UTC", "")).local().format(DisplayDateFormat +" "+ DisplayTimeFormat));
                    dataset.push(item.value);
                });
                var AudioReceiveLevelsChart = new Chart($("#cdr-AudioReceiveLevels"), {
                    type: 'line',
                    data: {
                        labels: labelset,
                        datasets: [{
                            label: lang.receive_audio_levels,
                            data: dataset,
                            backgroundColor: 'rgba(140, 0, 168, 0.5)',
                            borderColor: 'rgba(140, 0, 168, 1)',
                            borderWidth: 1,
                            pointRadius: 1
                        }]
                    },
                    options: ChatHistoryOptions
                });
                
                // SendPacketRateChart
                var labelset = [];
                var dataset = [];
                var data = (QosData0.SendPacketRate.length > 0)? QosData0.SendPacketRate : QosData1.SendPacketRate;
                $.each(data, function(i,item){
                    labelset.push(moment.utc(item.timestamp.replace(" UTC", "")).local().format(DisplayDateFormat +" "+ DisplayTimeFormat));
                    dataset.push(item.value);
                });
                var SendPacketRateChart = new Chart($("#cdr-AudioSendPacketRate"), {
                    type: 'line',
                    data: {
                        labels: labelset,
                        datasets: [{
                            label: lang.send_packets_per_second,
                            data: dataset,
                            backgroundColor: 'rgba(0, 121, 19, 0.5)',
                            borderColor: 'rgba(0, 121, 19, 1)',
                            borderWidth: 1,
                            pointRadius: 1
                        }]
                    },
                    options: ChatHistoryOptions
                });

                // AudioSendBitRateChart
                var labelset = [];
                var dataset = [];
                var data = (QosData0.SendBitRate.length > 0)? QosData0.SendBitRate : QosData1.SendBitRate;
                $.each(data, function(i,item){
                    labelset.push(moment.utc(item.timestamp.replace(" UTC", "")).local().format(DisplayDateFormat +" "+ DisplayTimeFormat));
                    dataset.push(item.value);
                });
                var AudioSendBitRateChart = new Chart($("#cdr-AudioSendBitRate"), {
                    type: 'line',
                    data: {
                        labels: labelset,
                        datasets: [{
                            label: lang.send_kilobits_per_second,
                            data: dataset,
                            backgroundColor: 'rgba(0, 121, 19, 0.5)',
                            borderColor: 'rgba(0, 121, 19, 1)',
                            borderWidth: 1,
                            pointRadius: 1
                        }]
                    },
                    options: ChatHistoryOptions
                });

            } else{
                console.warn("Result not expected", event.target.result);
            }
        }
    }
}
function DeleteQosData(buddy, stream){
    var indexedDB = window.indexedDB;
    var request = indexedDB.open("CallQosData", 1);
    request.onerror = function(event) {
        console.error("IndexDB Request Error:", event);
    }
    request.onupgradeneeded = function(event) {
        console.warn("Upgrade Required for IndexDB... probably because of first time use.");
        // If this is the case, there will be no call recordings
    }
    request.onsuccess = function(event) {
        console.log("IndexDB connected to CallQosData");

        var IDB = event.target.result;
        if(IDB.objectStoreNames.contains("CallQos") == false){
            console.warn("IndexDB CallQosData.CallQos does not exists");
            return;
        }
        IDB.onerror = function(event) {
            console.error("IndexDB Error:", event);
        }

        // Loop and Delete
        // Note:  This database can only delete based on Primary Key
        // The The Primary Key is arbitary, so you must get all the rows based
        // on a lookup, and delete from there.
        $.each(stream.DataCollection, function (i, item) {
            if (item.ItemType == "CDR" && item.SessionId && item.SessionId != "") {
                console.log("Deleting CallQosData: ", item.SessionId);
                var objectStore = IDB.transaction(["CallQos"], "readwrite").objectStore("CallQos");
                var objectStoreGet = objectStore.index('sessionid').getAll(item.SessionId);
                objectStoreGet.onerror = function(event) {
                    console.error("IndexDB Get Error:", event);
                }
                objectStoreGet.onsuccess = function(event) {
                    if(event.target.result && event.target.result.length > 0){
                        // There sre some rows to delete
                        $.each(event.target.result, function(i, item){
                            // console.log("Delete: ", item.uID);
                            try{
                                objectStore.delete(item.uID);
                            } catch(e){
                                console.log("Call CallQosData Delete failed: ", e);
                            }
                        });
                    }
                }
            }
        });


    }
}

/* Subscription
================== */
function SubscribeAll() {
    if(!userAgent.isRegistered()) return;
    if(userAgent.BlfSubs && userAgent.BlfSubs.length > 0){
        UnsubscribeAll();
    }
    userAgent.BlfSubs = [];
    if(Buddies.length >= 1){
        console.log("Starting Subscribtion of all ("+ Buddies.length +") Extension Contacts...");
        for(var b=0; b<Buddies.length; b++) {
            SubscribeBuddy(Buddies[b]);
        }
    }
}

function SubscribeBuddy(buddyObj) {
    if(!userAgent.isRegistered()) return;

    if((buddyObj.type == "extension" || buddyObj.type == "xmpp") && buddyObj.EnableSubscribe == true) {
        // PIDF Subscription TODO: make this an option.
        // Dialog Subscription (This version isnt as nice as PIDF)
        // var dialogOptions = { expires: 300, extraHeaders: ['Accept: application/dialog-info+xml'] }

        var dialogOptions = { expires: 300, extraHeaders: ['Accept: application/pidf+xml'] }
        // var dialogOptions = { expires: 300, extraHeaders: ['Accept: application/pidf+xml', 'application/xpidf+xml', 'application/simple-message-summary', 'application/im-iscomposing+xml'] }

        console.log("SUBSCRIBE: "+ buddyObj.ExtNo +"@" + wssServer);

        var targetURI = SIP.UserAgent.makeURI("sip:" + buddyObj.ExtNo + "@" + wssServer);
        var blfSubscribe = new SIP.Subscriber(userAgent, targetURI, "presence", dialogOptions);
        blfSubscribe.data = {}
        blfSubscribe.data.buddyId = buddyObj.identity;
        blfSubscribe.delegate = {
            onNotify: function(sip) {
                RecieveBlf(sip);
            }
        }
        blfSubscribe.subscribe().catch(function(error){
            console.warn("Error subscribing to Buddy notifications:", error);
        });
        userAgent.BlfSubs.push(blfSubscribe);
    }
}

function UnsubscribeAll() {
    if(!userAgent.isRegistered()) return;

    UnsubscribeVoicemail();

    if(userAgent.BlfSubs && userAgent.BlfSubs.length > 0){
        console.log("Unsubscribing "+ userAgent.BlfSubs.length + " subscriptions...");
        for (var blf = 0; blf < userAgent.BlfSubs.length; blf++) {
            UnsubscribeBlf(userAgent.BlfSubs[blf]);
        }
        userAgent.BlfSubs = [];

        for(var b=0; b<Buddies.length; b++) {
            var buddyObj = Buddies[b];
            if(buddyObj.type == "extension" || buddyObj.type == "xmpp") {
                $("#contact-" + buddyObj.identity + "-devstate").prop("class", "dotOffline");
                $("#contact-" + buddyObj.identity + "-devstate-main").prop("class", "dotOffline");
                $("#contact-" + buddyObj.identity + "-presence").html(lang.state_unknown);
                $("#contact-" + buddyObj.identity + "-presence-main").html(lang.state_unknown);
            }
        }
    }
}

function UnsubscribeBlf(blfSubscribe){
    if(!userAgent.isRegistered()) return;

    if(blfSubscribe.state == SIP.SubscriptionState.Subscribed){
        console.log("Unsubscribe to BLF Messages...", blfSubscribe.data.buddyId);
        blfSubscribe.unsubscribe().catch(function(error){
            console.warn("Error removing BLF notifications:", error);
        });
    }
    blfSubscribe.dispose().catch(function(error){
        console.warn("Error disposing BLF notifications:", error);
    });
    blfSubscribe = null;
}

function UnsubscribeBuddy(buddyObj) {
    if(buddyObj.type == "extension" || buddyObj.type == "xmpp") {
        if(userAgent.BlfSubs && userAgent.BlfSubs.length > 0){
            for (var blf = 0; blf < userAgent.BlfSubs.length; blf++) {
                var blfSubscribe = userAgent.BlfSubs[blf];
                if(blfSubscribe.data.buddyId == buddyObj.identity){
                    UnsubscribeBlf(userAgent.BlfSubs[blf]);
                    userAgent.BlfSubs.splice(blf, 1);
                    break;
                }
            }
        }
    }
}

/* Subscription Events
========================= */
function RecieveBlf(notification) {
    if (userAgent == null || !userAgent.isRegistered()) return;

    notification.accept();

    var buddy = "";
    var dotClass = "dotOffline";
    var Presence = "Unknown";

    var ContentType = notification.request.headers["Content-Type"][0].parsed;
    if (ContentType == "application/pidf+xml") {
        var xml = $($.parseXML(notification.request.body));
        buddy = xml.find("presence").find("tuple").attr("id");

        var Entity = xml.find("presence").attr("entity");
        var Contact = xml.find("presence").find("tuple").find("contact").text();
        var statusObj = xml.find("presence").find("tuple").find("status");
        var availability = xml.find("presence").find("tuple").find("status").find("basic").text();

        Presence = xml.find("presence").find("note").text();
    }
    else if (ContentType == "application/dialog-info+xml") {
        // Handle "Dialog" State

        var xml = $($.parseXML(notification.request.body));

        var ObservedUser = xml.find("dialog-info").attr("entity");
        buddy = ObservedUser.split("@")[0].split(":")[1];

        var version = xml.find("dialog-info").attr("version");
        var DialogState = xml.find("dialog-info").attr("state");
        var extId = xml.find("dialog-info").find("dialog").attr("id");

        var state = xml.find("dialog-info").find("dialog").find("state").text();
        if (state == "terminated") Presence = "Ready";
        if (state == "trying") Presence = "On the phone";
        if (state == "proceeding") Presence = "On the phone";
        if (state == "early") Presence = "Ringing";
        if (state == "confirmed") Presence = "On the phone";
    }

    var buddyObj = FindBuddyByExtNo(buddy);
    if(buddyObj == null) {
        console.warn("Buddy not found");
        return;
    }

    if (Presence == "Not online") dotClass = "dotOffline";
    if (Presence == "Ready") dotClass = "dotOnline";
    if (Presence == "On the phone") dotClass = "dotInUse";
    if (Presence == "Ringing") dotClass = "dotRinging";
    if (Presence == "On hold") dotClass = "dotOnHold";
    if (Presence == "Unavailable") dotClass = "dotOffline";

    // SIP Device State Indicators
    console.log("Setting DevSate State for "+ buddyObj.CallerIDName +" to "+ dotClass);
    buddyObj.devState = dotClass;
    $("#contact-" + buddyObj.identity + "-devstate").prop("class", dotClass);
    $("#contact-" + buddyObj.identity + "-devstate-main").prop("class", dotClass);

    // Presence (SIP)
    // SIP uses Devices states only
    buddyObj.presence = Presence;
    if (Presence == "Not online") Presence = lang.state_not_online;
    if (Presence == "Ready") Presence = lang.state_ready;
    if (Presence == "On the phone") Presence = lang.state_on_the_phone;
    if (Presence == "Ringing") Presence = lang.state_ringing;
    if (Presence == "On hold") Presence = lang.state_on_hold;
    if (Presence == "Unavailable") Presence = lang.state_unavailable;
    $("#contact-" + buddyObj.identity + "-presence").html(Presence);
    $("#contact-" + buddyObj.identity + "-presence-main").html(Presence);
}

function AddCallMessage(buddy, session) {

    var currentStream = JSON.parse(localDB.getItem(buddy + "-stream"));
    if(currentStream == null) currentStream = InitinaliseStream(buddy);

    var CallEnd = moment.sast(); // Time Hung-up
    var callDuration = 0;
    var totalDuration = 0;
    var ringTime = 0;

    var CallStart = moment.sast(session.data.callstart.replace(" SAST", "")); // Actual start (both inbound and outbound)
    var CallAnswer = null; // On Accept when inbound, Remote Side when Outbound
    if(session.data.startTime){
        // The time when WE answered the call (May be null - no answer)
        // or
        // The time when THEY answered the call (May be null - no answer)
        CallAnswer = moment.sast(session.data.startTime);  // Local Time gets converted to SAST
        callDuration = moment.duration(CallEnd.diff(CallAnswer));
        ringTime = moment.duration(CallAnswer.diff(CallStart));
    } 
    else {
        // There was no start time, but this would indicate the ring time on inbound/outbound calls
        ringTime = moment.duration(CallEnd.diff(CallStart));
    }
    totalDuration = moment.duration(CallEnd.diff(CallStart));

    var srcId = "";
    var srcCallerID = "";
    var dstId = ""
    var dstCallerID = "";
    if(session.data.calldirection == "inbound") {
        srcId = buddy;
        dstId = profileUserID;
        srcCallerID = "<"+ session.remoteIdentity.uri.user +"> "+ session.remoteIdentity.displayName;
        dstCallerID = "<"+ profileUser+"> "+ profileName;
    } else if(session.data.calldirection == "outbound") {
        srcId = profileUserID;
        dstId = buddy;
        srcCallerID = "<"+ profileUser+"> "+ profileName;
        dstCallerID = session.remoteIdentity.uri.user;
    }

    var callDirection = session.data.calldirection;
    var sessionId = session.id;
    var hanupBy = session.data.terminateby;

    var newMessageJson = {
        CdrId: uID(),
        ItemType: "CDR",
        ItemDate: CallStart.format("YYYY-MM-DD HH:mm:ss UTC"),
        CallAnswer: (CallAnswer)? CallAnswer.format("YYYY-MM-DD HH:mm:ss UTC") : null,
        CallEnd: CallEnd.format("YYYY-MM-DD HH:mm:ss UTC"),
        SrcUserId: srcId,
        Src: srcCallerID,
        DstUserId: dstId,
        Dst: dstCallerID,
        RingTime: (ringTime != 0)? ringTime.asSeconds() : 0,
        Billsec: (callDuration != 0)? callDuration.asSeconds() : 0,
        TotalDuration: (totalDuration != 0)? totalDuration.asSeconds() : 0,
        ReasonCode: session.data.reasonCode,
        ReasonText: session.data.reasonText,
        SessionId: sessionId,
        CallDirection: callDirection,
        Terminate: hanupBy,
        MessageData: null,
        Tags: [],
        //Reporting
        Transfers: (session.data.transfer)? session.data.transfer : [],
        Mutes: (session.data.mute)? session.data.mute : [],
        Holds: (session.data.hold)? session.data.hold : [],
        Recordings: (session.data.recordings)? session.data.recordings : [],
        ConfCalls: (session.data.confcalls)? session.data.confcalls : [],
        ConfbridgeEvents: (session.data.ConfbridgeEvents)? session.data.ConfbridgeEvents : [],
        QOS: []
    }

    console.log("New CDR", newMessageJson);

    currentStream.DataCollection.push(newMessageJson);
    currentStream.TotalRows = currentStream.DataCollection.length;
    localDB.setItem(buddy + "-stream", JSON.stringify(currentStream));

    UpdateBuddyActivity(buddy);

    // Data Cleanup
    if(MaxDataStoreDays && MaxDataStoreDays > 0){
        console.log("Cleaning up data: ", MaxDataStoreDays);
        RemoveBuddyMessageStream(FindBuddyByIdentity(buddy), MaxDataStoreDays);
    }

}

/* Outbound Calling
====================== */
function AudioCallMenu(buddy, obj){
    var buddyObj = FindBuddyByIdentity(buddy);
    if(buddyObj == null) return;

    var items = [];
    if(buddyObj.type == "extension") {
        items.push({icon: "fa fa-phone-square", text: lang.call_extension + " ("+ buddyObj.ExtNo +")", value: buddyObj.ExtNo});
        if(buddyObj.MobileNumber != null && buddyObj.MobileNumber != "") {
            items.push({icon: "fa fa-mobile", text: lang.call_mobile + " ("+ buddyObj.MobileNumber +")", value: buddyObj.MobileNumber});
        }
        if(buddyObj.ContactNumber1 != null && buddyObj.ContactNumber1 != "") {
            items.push({icon: "fa fa-phone", text: lang.call_number + " ("+ buddyObj.ContactNumber1 +")", value: buddyObj.ContactNumber1});
        }
        if(buddyObj.ContactNumber2 != null && buddyObj.ContactNumber2 != "") {
            items.push({icon: "fa fa-phone", text: lang.call_number + " ("+ buddyObj.ContactNumber2 +")", value: buddyObj.ContactNumber2});
        }
    }
    else if(buddyObj.type == "contact") {
        if(buddyObj.MobileNumber != null && buddyObj.MobileNumber != "") {
            items.push({icon: "fa fa-mobile", text: lang.call_mobile + " ("+ buddyObj.MobileNumber +")", value: buddyObj.MobileNumber});
        }
        if(buddyObj.ContactNumber1 != null && buddyObj.ContactNumber1 != "") {
            items.push({icon: "fa fa-phone", text: lang.call_number + " ("+ buddyObj.ContactNumber1 +")", value: buddyObj.ContactNumber1});
        }
        if(buddyObj.ContactNumber2 != null && buddyObj.ContactNumber2 != "") {
            items.push({icon: "fa fa-phone", text: lang.call_number + " ("+ buddyObj.ContactNumber2 +")", value: buddyObj.ContactNumber2});
        }
    }
    else if(buddyObj.type == "group") {
        if(buddyObj.MobileNumber != null && buddyObj.MobileNumber != "") {
            items.push({icon: "fa fa-users", text: lang.call_group, value: buddyObj.ExtNo });
        }
    }
    if(items.length == 0) {
        console.error("No numbers to dial");
        EditBuddyWindow(buddy);
        return;
    }
    if(items.length == 1) {
        // only one number provided, call it
        console.log("Automatically calling only number - AudioCall("+ buddy +", "+ items[0].value +")");

        DialByLine("audio", buddy, items[0].value);
    }
    else {
        // Show numbers to dial

        var menu = {
            selectEvent : function( event, ui ) {
                var number = ui.item.attr("value");
                HidePopup();
                if(number != null) {
                    console.log("Menu click AudioCall("+ buddy +", "+ number +")");
                    DialByLine("audio", buddy, number);
                }
            },
            createEvent : null,
            autoFocus : true,
            items : items
        }
        PopupMenu(obj, menu);
    }
}

function AudioCall(lineObj, dialledNumber, extraHeaders) {
    if(userAgent == null) return;
    if(userAgent.isRegistered() == false) return;
    if(lineObj == null) return;

    if(HasAudioDevice == false){
        Alert(lang.alert_no_microphone);
        return;
    }

    var supportedConstraints = navigator.mediaDevices.getSupportedConstraints();

    var spdOptions = {
        earlyMedia: true,
        sessionDescriptionHandlerOptions: {
            constraints: {
                audio: { deviceId : "default" },
            }
        }
    }
    // Configure Audio
    var currentAudioDevice = getAudioSrcID();
    if(currentAudioDevice != "default"){
        var confirmedAudioDevice = false;
        for (var i = 0; i < AudioinputDevices.length; ++i) {
            if(currentAudioDevice == AudioinputDevices[i].deviceId) {
                confirmedAudioDevice = true;
                break;
            }
        }
        if(confirmedAudioDevice) {
            spdOptions.sessionDescriptionHandlerOptions.constraints.audio.deviceId = { exact: currentAudioDevice }
        }
        else {
            console.warn("The audio device you used before is no longer available, default settings applied.");
            localDB.setItem("AudioSrcId", "default");
        }
    }
    // Add additional Constraints
    if(supportedConstraints.autoGainControl) {
        spdOptions.sessionDescriptionHandlerOptions.constraints.audio.autoGainControl = AutoGainControl;
    }
    if(supportedConstraints.echoCancellation) {
        spdOptions.sessionDescriptionHandlerOptions.constraints.audio.echoCancellation = EchoCancellation;
    }
    if(supportedConstraints.noiseSuppression) {
        spdOptions.sessionDescriptionHandlerOptions.constraints.audio.noiseSuppression = NoiseSuppression;
    }
    // Extra Headers
    if(extraHeaders) {
        spdOptions.extraHeaders = extraHeaders;
    }

    $("#line-" + lineObj.LineNumber + "-msg").html(lang.starting_audio_call);
    $("#line-" + lineObj.LineNumber + "-timer").show();

    var startTime = moment.utc();

    // Invite
    console.log("INVITE (audio): " + dialledNumber + "@" + wssServer);

    var targetURI = SIP.UserAgent.makeURI("sip:" + dialledNumber + "@" + wssServer);
    lineObj.SipSession = new SIP.Inviter(userAgent, targetURI, spdOptions);
    lineObj.SipSession.data = {}
    lineObj.SipSession.data.line = lineObj.LineNumber;
    lineObj.SipSession.data.buddyId = lineObj.BuddyObj.identity;
    lineObj.SipSession.data.calldirection = "outbound";
    lineObj.SipSession.data.dst = dialledNumber;
    lineObj.SipSession.data.callstart = startTime.format("YYYY-MM-DD HH:mm:ss UTC");
    lineObj.SipSession.data.callTimer = window.setInterval(function(){
        var now = moment.utc();
        var duration = moment.duration(now.diff(startTime)); 
        $("#line-" + lineObj.LineNumber + "-timer").html(formatShortDuration(duration.asSeconds()));
    }, 1000);

    lineObj.SipSession.data.AudioSourceDevice = getAudioSrcID();
    lineObj.SipSession.data.AudioOutputDevice = getAudioOutputID();
    lineObj.SipSession.data.terminateby = "them";
    lineObj.SipSession.data.earlyReject = false;
    lineObj.SipSession.isOnHold = false;
    lineObj.SipSession.delegate = {
        onBye: function(sip){
            onSessionRecievedBye(lineObj, sip);
        },
        onMessage: function(sip){
            onSessionRecievedMessage(lineObj, sip);
        },
        onInvite: function(sip){
            onSessionReinvited(lineObj, sip);
        },
        onSessionDescriptionHandler: function(sdh, provisional){
            onSessionDescriptionHandlerCreated(lineObj, sdh, provisional, false);
        }
    }    
    var inviterOptions = {
        requestDelegate: { // OutgoingRequestDelegate
            onTrying: function(sip){
                onInviteTrying(lineObj, sip);
            },
            onProgress:function(sip){
                onInviteProgress(lineObj, sip);
            },
            onRedirect:function(sip){
                onInviteRedirected(lineObj, sip);
            },
            onAccept:function(sip){
                onInviteAccepted(lineObj, false, sip);
            },
            onReject:function(sip){
                onInviteRejected(lineObj, sip);
            }
        }
    }
    lineObj.SipSession.invite(inviterOptions).catch(function(e){
        console.warn("Failed to send INVITE:", e);
    });

    $("#line-" + lineObj.LineNumber + "-btn-settings").removeAttr('disabled');
    $("#line-" + lineObj.LineNumber + "-btn-audioCall").prop('disabled','disabled');
    $("#line-" + lineObj.LineNumber + "-btn-search").removeAttr('disabled');
    $("#line-" + lineObj.LineNumber + "-btn-remove").prop('disabled','disabled');

    $("#line-" + lineObj.LineNumber + "-progress").show();
    $("#line-" + lineObj.LineNumber + "-msg").show();

    UpdateUI();
    UpdateBuddyList();
    updateLineScroll(lineObj.LineNumber);

    // Custom Web hook
    if(typeof web_hook_on_invite !== 'undefined') web_hook_on_invite(lineObj.SipSession);    
}

/* Call Activity Sessions
============================ */
function getSession(buddy) {
    if(userAgent == null) {
        console.warn("userAgent is null");
        return null;
    }
    if(userAgent.isRegistered() == false) {
        console.warn("userAgent is not registered");
        return null;
    }

    var rtnSession = null;
    $.each(userAgent.sessions, function (i, session) {
        if(session.data.buddyId == buddy) {
            rtnSession = session;
            return false;
        }
    });
    return rtnSession;
}

function countSessions(id){
    var rtn = 0;
    if(userAgent == null) {
        console.warn("userAgent is null");
        return 0;
    }
    $.each(userAgent.sessions, function (i, session) {
        if(id != session.id) rtn ++;
    });
    return rtn;
}

/* Stream Manipulation
========================= */
function MixAudioStreams(MultiAudioTackStream){
    // Takes in a MediaStream with any mumber of audio tracks and mixes them together

    var audioContext = null;
    try {
        window.AudioContext = window.AudioContext || window.webkitAudioContext;
        audioContext = new AudioContext();
    }
    catch(e){
        console.warn("AudioContext() not available, cannot record");
        return MultiAudioTackStream;
    }
    var mixedAudioStream = audioContext.createMediaStreamDestination();
    MultiAudioTackStream.getAudioTracks().forEach(function(audioTrack){
        var srcStream = new MediaStream();
        srcStream.addTrack(audioTrack);
        var streamSourceNode = audioContext.createMediaStreamSource(srcStream);
        streamSourceNode.connect(mixedAudioStream);
    });

    return mixedAudioStream.stream;
}

/* Transfers
=============== */
function QuickFindBuddy(obj){
    var filter = obj.value;
    if(filter == "") return;

    console.log("Find Buddy: ", filter);

    Buddies.sort(function(a, b){
        if(a.CallerIDName < b.CallerIDName) return -1;
        if(a.CallerIDName > b.CallerIDName) return 1;
        return 0;
    });

    var items = [];
    var visibleItems = 0;
    for(var b = 0; b < Buddies.length; b++){
        var buddyObj = Buddies[b];

        // Perform Filter Display
        var display = false;
        if(buddyObj.CallerIDName.toLowerCase().indexOf(filter.toLowerCase()) > -1) display = true;
        if(buddyObj.ExtNo.toLowerCase().indexOf(filter.toLowerCase()) > -1) display = true;
        if(buddyObj.Desc.toLowerCase().indexOf(filter.toLowerCase()) > -1) display = true;
        if(buddyObj.MobileNumber.toLowerCase().indexOf(filter.toLowerCase()) > -1) display = true;
        if(buddyObj.ContactNumber1.toLowerCase().indexOf(filter.toLowerCase()) > -1) display = true;
        if(buddyObj.ContactNumber2.toLowerCase().indexOf(filter.toLowerCase()) > -1) display = true;
        if(display) {
            // Filtered Results
            var iconColor = "#404040";
            if(buddyObj.presence == "Unknown" || buddyObj.presence == "Not online" || buddyObj.presence == "Unavailable") iconColor = "#666666";
            if(buddyObj.presence == "Ready") iconColor = "#3fbd3f";
            if(buddyObj.presence == "On the phone" || buddyObj.presence == "Ringing" || buddyObj.presence == "On hold") iconColor = "#c99606";

            if(visibleItems > 0) items.push({ value: null, text: "-"});
            items.push({ value: null, text: buddyObj.CallerIDName, isHeader: true });
            if(buddyObj.ExtNo != "") {
                items.push({ icon : "fa fa-phone-square", text: lang.extension +" ("+ buddyObj.presence +"): "+ buddyObj.ExtNo, value: buddyObj.ExtNo });
            }
            if(buddyObj.MobileNumber != "") {
                items.push({ icon : "fa fa-mobile", text: lang.mobile +": "+ buddyObj.MobileNumber, value: buddyObj.MobileNumber });
            }
            if(buddyObj.ContactNumber1 != "") {
                items.push({ icon : "fa fa-phone", text: lang.call +": "+ buddyObj.ContactNumber1, value: buddyObj.ContactNumber1 });
            }
            if(buddyObj.ContactNumber2 != "") {
                items.push({ icon : "fa fa-phone", text: lang.call +": "+ buddyObj.ContactNumber2, value: buddyObj.ContactNumber2 });
            }
            visibleItems++;
        }
        if(visibleItems >= 5) break;
    }

    if(items.length > 1){
        var menu = {
            selectEvent : function( event, ui ) {
                var number = ui.item.attr("value");
                if(number == null) HidePopup();
                if(number != "null" && number != "" && number != undefined) {
                    HidePopup();
                    obj.value = number;
                }
            },
            createEvent : null,
            autoFocus : false,
            items : items
        }
        PopupMenu(obj, menu);
    } 
    else {
        HidePopup();
    }
}

// Call Transfer
function StartTransferSession(lineNum){
    if($("#line-"+ lineNum +"-btn-CancelConference").is(":visible")){
        CancelConference(lineNum);
        return;
    }

    $("#line-"+ lineNum +"-btn-Transfer").hide();
    $("#line-"+ lineNum +"-btn-CancelTransfer").show();

    holdSession(lineNum);
    $("#line-"+ lineNum +"-txt-FindTransferBuddy").val("");
    $("#line-"+ lineNum +"-txt-FindTransferBuddy").parent().show();

    $("#line-"+ lineNum +"-btn-blind-transfer").show();
    $("#line-"+ lineNum +"-btn-attended-transfer").show();
    $("#line-"+ lineNum +"-btn-complete-transfer").hide();
    $("#line-"+ lineNum +"-btn-cancel-transfer").hide();

    $("#line-"+ lineNum +"-btn-complete-attended-transfer").hide();
    $("#line-"+ lineNum +"-btn-cancel-attended-transfer").hide();
    $("#line-"+ lineNum +"-btn-terminate-attended-transfer").hide();

    $("#line-"+ lineNum +"-transfer-status").hide();

    $("#line-"+ lineNum +"-Transfer").show();

    updateLineScroll(lineNum);
}

// Cancel Tranfer
function CancelTransferSession(lineNum){
    var lineObj = FindLineByNumber(lineNum);
    if(lineObj == null || lineObj.SipSession == null){
        console.warn("Null line or session");
        return;
    }
    var session = lineObj.SipSession;
    if(session.data.childsession){
        console.log("Child Transfer call detected:", session.data.childsession.state);
        session.data.childsession.dispose().then(function(){
            session.data.childsession = null;
        }).catch(function(error){
            session.data.childsession = null;
        });
    }


    $("#line-"+ lineNum +"-btn-Transfer").show();
    $("#line-"+ lineNum +"-btn-CancelTransfer").hide();

    unholdSession(lineNum);
    $("#line-"+ lineNum +"-Transfer").hide();

    updateLineScroll(lineNum);
}

// Blind Transfer
function BlindTransfer(lineNum) {
    var dstNo = $("#line-"+ lineNum +"-txt-FindTransferBuddy").val().replace(/[^0-9\*\#\+]/g,'');
    if(dstNo == ""){
        console.warn("Cannot transfer, must be [0-9*+#]");
        return;
    }

    var lineObj = FindLineByNumber(lineNum);
    if(lineObj == null || lineObj.SipSession == null){
        console.warn("Null line or session");
        return;
    }
    var session = lineObj.SipSession;

    if(!session.data.transfer) session.data.transfer = [];
    session.data.transfer.push({ 
        type: "Blind", 
        to: dstNo, 
        transferTime: utcDateNow(), 
        disposition: "refer",
        dispositionTime: utcDateNow(), 
        accept : {
            complete: null,
            eventTime: null,
            disposition: ""
        }
    });
    var transferid = session.data.transfer.length-1;

    var transferOptions  = { 
        requestDelegate: {
            onAccept: function(sip){
                console.log("Blind transfer Accepted");

                session.data.terminateby = "us";
                session.data.reasonCode = 202;
                session.data.reasonText = "Transfer";
            
                session.data.transfer[transferid].accept.complete = true;
                session.data.transfer[transferid].accept.disposition = sip.message.reasonPhrase;
                session.data.transfer[transferid].accept.eventTime = utcDateNow();

                $("#line-" + lineNum + "-msg").html("Call Blind Transfered (Accepted)");

                updateLineScroll(lineNum);

                session.bye().catch(function(error){
                    console.warn("Could not BYE after blind transfer:", error);
                });
                teardownSession(lineObj);
            },
            onReject:function(sip){
                console.warn("REFER rejected:", sip);

                session.data.transfer[transferid].accept.complete = false;
                session.data.transfer[transferid].accept.disposition = sip.message.reasonPhrase;
                session.data.transfer[transferid].accept.eventTime = utcDateNow();

                $("#line-" + lineNum + "-msg").html("Call Blind Failed!");

                updateLineScroll(lineNum);
                // Session should still be up, so just allow them to try again
            }
        }
    }
    console.log("REFER: ", dstNo + "@" + wssServer);
    var referTo = SIP.UserAgent.makeURI("sip:"+ dstNo + "@" + wssServer);
    session.refer(referTo, transferOptions).catch(function(error){
        console.warn("Failed to REFER", error);
    });;

    $("#line-" + lineNum + "-msg").html(lang.call_blind_transfered);

    updateLineScroll(lineNum);
}
function AttendedTransfer(lineNum){
    var dstNo = $("#line-"+ lineNum +"-txt-FindTransferBuddy").val().replace(/[^0-9\*\#\+]/g,'');
    if(dstNo == ""){
        console.warn("Cannot transfer, must be [0-9*+#]");
        return;
    }
    
    var lineObj = FindLineByNumber(lineNum);
    if(lineObj == null || lineObj.SipSession == null){
        console.warn("Null line or session");
        return;
    }
    var session = lineObj.SipSession;

    HidePopup();

    $("#line-"+ lineNum +"-txt-FindTransferBuddy").parent().hide();
    $("#line-"+ lineNum +"-btn-blind-transfer").hide();
    $("#line-"+ lineNum +"-btn-attended-transfer").hide();

    $("#line-"+ lineNum +"-btn-complete-attended-transfer").hide();
    $("#line-"+ lineNum +"-btn-cancel-attended-transfer").hide();
    $("#line-"+ lineNum +"-btn-terminate-attended-transfer").hide();


    var newCallStatus = $("#line-"+ lineNum +"-transfer-status");
    newCallStatus.html(lang.connecting);
    newCallStatus.show();

    if(!session.data.transfer) session.data.transfer = [];
    session.data.transfer.push({ 
        type: "Attended", 
        to: dstNo, 
        transferTime: utcDateNow(), 
        disposition: "invite",
        dispositionTime: utcDateNow(), 
        accept : {
            complete: null,
            eventTime: null,
            disposition: ""
        }
    });
    var transferid = session.data.transfer.length-1;

    updateLineScroll(lineNum);

    var supportedConstraints = navigator.mediaDevices.getSupportedConstraints();
    var spdOptions = {
        earlyMedia: true,
        sessionDescriptionHandlerOptions: {
            constraints: {
                audio: { deviceId : "default" },
            }
        }
    }
    if(session.data.AudioSourceDevice != "default"){
        spdOptions.sessionDescriptionHandlerOptions.constraints.audio.deviceId = { exact: session.data.AudioSourceDevice }
    }

    // Add additional Constraints
    if(supportedConstraints.autoGainControl) {
        spdOptions.sessionDescriptionHandlerOptions.constraints.audio.autoGainControl = AutoGainControl;
    }
    if(supportedConstraints.echoCancellation) {
        spdOptions.sessionDescriptionHandlerOptions.constraints.audio.echoCancellation = EchoCancellation;
    }
    if(supportedConstraints.noiseSuppression) {
        spdOptions.sessionDescriptionHandlerOptions.constraints.audio.noiseSuppression = NoiseSuppression;
    }

    // Create new call session
    console.log("TRANSFER INVITE: ", "sip:" + dstNo + "@" + wssServer);
    var targetURI = SIP.UserAgent.makeURI("sip:"+ dstNo + "@" + wssServer);
    var newSession = new SIP.Inviter(userAgent, targetURI, spdOptions);
    newSession.data = {}
    newSession.delegate = {
        onBye: function(sip){
            console.log("New call session ended with BYE");
            newCallStatus.html(lang.call_ended);
            session.data.transfer[transferid].disposition = "bye";
            session.data.transfer[transferid].dispositionTime = utcDateNow();

            $("#line-"+ lineNum +"-txt-FindTransferBuddy").parent().show();
            $("#line-"+ lineNum +"-btn-blind-transfer").show();
            $("#line-"+ lineNum +"-btn-attended-transfer").show();
    
            $("#line-"+ lineNum +"-btn-complete-attended-transfer").hide();
            $("#line-"+ lineNum +"-btn-cancel-attended-transfer").hide();
            $("#line-"+ lineNum +"-btn-terminate-attended-transfer").hide();
    
            $("#line-"+ lineNum +"-msg").html(lang.attended_transfer_call_terminated);
    
            updateLineScroll(lineNum);
    
            window.setTimeout(function(){
                newCallStatus.hide();
                updateLineScroll(lineNum);
            }, 1000);
        },
        onSessionDescriptionHandler: function(sdh, provisional){
            if (sdh) {
                if(sdh.peerConnection){
                    sdh.peerConnection.ontrack = function(event){
                        var pc = sdh.peerConnection;

                        // Gets Remote Audio Track (Local audio is setup via initial GUM)
                        var remoteStream = new MediaStream();
                        pc.getReceivers().forEach(function (receiver) {
                            if(receiver.track && receiver.track.kind == "audio"){
                                remoteStream.addTrack(receiver.track);
                            }
                        });
                        var remoteAudio = $("#line-" + lineNum + "-transfer-remoteAudio").get(0);
                        remoteAudio.srcObject = remoteStream;
                        remoteAudio.onloadedmetadata = function(e) {
                            if (typeof remoteAudio.sinkId !== 'undefined') {
                                remoteAudio.setSinkId(session.data.AudioOutputDevice).then(function(){
                                    console.log("sinkId applied: "+ session.data.AudioOutputDevice);
                                }).catch(function(e){
                                    console.warn("Error using setSinkId: ", e);
                                });
                            }
                            remoteAudio.play();
                        }

                    }
                }
                else{
                    console.warn("onSessionDescriptionHandler fired without a peerConnection");
                }
            }
            else{
                console.warn("onSessionDescriptionHandler fired without a sessionDescriptionHandler");
            }
        }
    }

    session.data.childsession = newSession;
    var inviterOptions = {
        requestDelegate: {
            onTrying: function(sip){
                newCallStatus.html(lang.trying);
                session.data.transfer[transferid].disposition = "trying";
                session.data.transfer[transferid].dispositionTime = utcDateNow();

                $("#line-" + lineNum + "-msg").html(lang.attended_transfer_call_started);
            },
            onProgress:function(sip){
                newCallStatus.html(lang.ringing);
                session.data.transfer[transferid].disposition = "progress";
                session.data.transfer[transferid].dispositionTime = utcDateNow();

                $("#line-" + lineNum + "-msg").html(lang.attended_transfer_call_started);

                var CancelAttendedTransferBtn = $("#line-"+ lineNum +"-btn-cancel-attended-transfer");
                CancelAttendedTransferBtn.off('click');
                CancelAttendedTransferBtn.on('click', function(){
                    newSession.cancel().catch(function(error){
                        console.warn("Failed to CANCEL", error);
                    });
                    newCallStatus.html(lang.call_cancelled);
                    console.log("New call session canceled");
        
                    session.data.transfer[transferid].accept.complete = false;
                    session.data.transfer[transferid].accept.disposition = "cancel";
                    session.data.transfer[transferid].accept.eventTime = utcDateNow();
        
                    $("#line-" + lineNum + "-msg").html(lang.attended_transfer_call_cancelled);
        
                    updateLineScroll(lineNum);
                });
                CancelAttendedTransferBtn.show();
        
                updateLineScroll(lineNum);
            },
            onRedirect:function(sip){
                console.log("Redirect received:", sip);
            },
            onAccept:function(sip){
                newCallStatus.html(lang.call_in_progress);
                $("#line-"+ lineNum +"-btn-cancel-attended-transfer").hide();
                session.data.transfer[transferid].disposition = "accepted";
                session.data.transfer[transferid].dispositionTime = utcDateNow();
        
                var CompleteTransferBtn = $("#line-"+ lineNum +"-btn-complete-attended-transfer");
                CompleteTransferBtn.off('click');
                CompleteTransferBtn.on('click', function(){
                    var transferOptions  = { 
                        requestDelegate: {
                            onAccept: function(sip){
                                console.log("Attended transfer Accepted");

                                session.data.terminateby = "us";
                                session.data.reasonCode = 202;
                                session.data.reasonText = "Attended Transfer";

                                session.data.transfer[transferid].accept.complete = true;
                                session.data.transfer[transferid].accept.disposition = sip.message.reasonPhrase;
                                session.data.transfer[transferid].accept.eventTime = utcDateNow();

                                $("#line-" + lineNum + "-msg").html(lang.attended_transfer_complete_accepted);

                                updateLineScroll(lineNum);

                                // End this session manually
                                session.bye().catch(function(error){
                                    console.warn("Could not BYE after blind transfer:", error);
                                });

                                teardownSession(lineObj);
                            },
                            onReject: function(sip){
                                console.warn("Attended transfer rejected:", sip);

                                session.data.transfer[transferid].accept.complete = false;
                                session.data.transfer[transferid].accept.disposition = sip.message.reasonPhrase;
                                session.data.transfer[transferid].accept.eventTime = utcDateNow();

                                $("#line-" + lineNum + "-msg").html("Attended Transfer Failed!");

                                updateLineScroll(lineNum);
                            }
                        }
                    }
        
                    // Send REFER
                    session.refer(newSession, transferOptions).catch(function(error){
                        console.warn("Failed to REFER", error);
                    });
        
                    newCallStatus.html(lang.attended_transfer_complete);

                    updateLineScroll(lineNum);
                });
                CompleteTransferBtn.show();
        
                updateLineScroll(lineNum);
        
                var TerminateAttendedTransferBtn = $("#line-"+ lineNum +"-btn-terminate-attended-transfer");
                TerminateAttendedTransferBtn.off('click');
                TerminateAttendedTransferBtn.on('click', function(){
                    newSession.bye().catch(function(error){
                        console.warn("Failed to BYE", error);
                    });
                    newCallStatus.html(lang.call_ended);
                    console.log("New call session end");
        
                    session.data.transfer[transferid].accept.complete = false;
                    session.data.transfer[transferid].accept.disposition = "bye";
                    session.data.transfer[transferid].accept.eventTime = utcDateNow();
        
                    $("#line-"+ lineNum +"-btn-complete-attended-transfer").hide();
                    $("#line-"+ lineNum +"-btn-cancel-attended-transfer").hide();
                    $("#line-"+ lineNum +"-btn-terminate-attended-transfer").hide();

                    $("#line-" + lineNum + "-msg").html(lang.attended_transfer_call_ended);

                    updateLineScroll(lineNum);

                    window.setTimeout(function(){
                        newCallStatus.hide();
                        CancelTransferSession(lineNum);
                        updateLineScroll(lineNum);
                    }, 1000);
                });
                TerminateAttendedTransferBtn.show();

                updateLineScroll(lineNum);
            },
            onReject:function(sip){
                console.log("New call session rejected: ", sip.message.reasonPhrase);
                newCallStatus.html(lang.call_rejected);
                session.data.transfer[transferid].disposition = sip.message.reasonPhrase;
                session.data.transfer[transferid].dispositionTime = utcDateNow();
        
                $("#line-"+ lineNum +"-txt-FindTransferBuddy").parent().show();
                $("#line-"+ lineNum +"-btn-blind-transfer").show();
                $("#line-"+ lineNum +"-btn-attended-transfer").show();
        
                $("#line-"+ lineNum +"-btn-complete-attended-transfer").hide();
                $("#line-"+ lineNum +"-btn-cancel-attended-transfer").hide();
                $("#line-"+ lineNum +"-btn-terminate-attended-transfer").hide();
        
                $("#line-"+ lineNum +"-msg").html(lang.attended_transfer_call_rejected);
        
                updateLineScroll(lineNum);
        
                window.setTimeout(function(){
                    newCallStatus.hide();
                    updateLineScroll(lineNum);
                }, 1000);
            }
        }
    }
    newSession.invite(inviterOptions).catch(function(e){
        console.warn("Failed to send INVITE:", e);
    });
}

/* Phone Lines
================= */
var Line = function(lineNumber, displayName, displayNumber, buddyObj){
    this.LineNumber = lineNumber;
    this.DisplayName = displayName;
    this.DisplayNumber = displayNumber;
    this.IsSelected = false;
    this.BuddyObj = buddyObj;
    this.SipSession = null;
    this.LocalSoundMeter = null;
    this.RemoteSoundMeter = null;
}

function ShowDial(){
    ShowContacts();

    $("#myContacts").hide();
    $("#actionArea").empty();

    var html = "<div style=\"text-align:right\"><button onclick=\"ShowContacts()\"><i class=\"fa fa-close\"></i></button></div>"
    html += "<div style=\"text-align:center\"><input id=dialText class=dialTextInput oninput=\"handleDialInput(this, event)\" onkeydown=\"dialOnkeydown(event, this)\" style=\"width:160px; margin-top:15px\"></div>";
    html += "<table cellspacing=10 cellpadding=0 style=\"margin-left:auto; margin-right: auto\">";
    html += "<tr><td><button class=dialButtons onclick=\"KeyPress('1')\"><div>1</div><span>&nbsp;</span></button></td>"
    html += "<td><button class=dialButtons onclick=\"KeyPress('2')\"><div>2</div><span>ABC</span></button></td>"
    html += "<td><button class=dialButtons onclick=\"KeyPress('3')\"><div>3</div><span>DEF</span></button></td></tr>";
    html += "<tr><td><button class=dialButtons onclick=\"KeyPress('4')\"><div>4</div><span>GHI</span></button></td>"
    html += "<td><button class=dialButtons onclick=\"KeyPress('5')\"><div>5</div><span>JKL</span></button></td>"
    html += "<td><button class=dialButtons onclick=\"KeyPress('6')\"><div>6</div><span>MNO</span></button></td></tr>";
    html += "<tr><td><button class=dialButtons onclick=\"KeyPress('7')\"><div>7</div><span>PQRS</span></button></td>"
    html += "<td><button class=dialButtons onclick=\"KeyPress('8')\"><div>8</div><span>TUV</span></button></td>"
    html += "<td><button class=dialButtons onclick=\"KeyPress('9')\"><div>9</div><span>WXYZ</span></button></td></tr>";
    html += "<tr><td><button class=dialButtons onclick=\"KeyPress('*')\">*</button></td>"
    html += "<td><button class=dialButtons onclick=\"KeyPress('0')\">0</button></td>"
    html += "<td><button class=dialButtons onclick=\"KeyPress('#')\">#</button></td></tr>";
    html += "</table>";
    html += "<div style=\"text-align: center; margin-bottom:15px\">";
    html += "<button class=\"dialButtons\" id=dialAudio style=\"background-color: #067d0f;\" title=\""+ lang.audio_call  +"\" onclick=\"DialByLine('audio')\"><i class=\"fa fa-phone\"></i></button>";
    html += "</div>";

    $("#actionArea").html(html);
    $("#actionArea").show();
    $("#dialText").focus();
}

function handleDialInput(obj, event){
    if(EnableAlphanumericDial){
        $("#dialText").val($("#dialText").val().replace(/[^\da-zA-Z\*\#\+]/g, "").substring(0,MaxDidLength));
    }
    else {
        $("#dialText").val($("#dialText").val().replace(/[^\d\*\#\+]/g, "").substring(0,MaxDidLength));
    }
}

function dialOnkeydown(event, obj, buddy) {
    var keycode = (event.keyCode ? event.keyCode : event.which);
    if (keycode == '13'){
        event.preventDefault();

        // Defaults to audio dial
        DialByLine('audio');
        return false;
    }
}

function KeyPress(num){
    $("#dialText").val(($("#dialText").val()+num).substring(0,MaxDidLength));
}

function ShowContacts(){
    // Microphone Preview
    try{
        var tracks = window.SettingsMicrophoneStream.getTracks();
        tracks.forEach(function(track) {
            track.stop();
        });
    }
    catch(e){}
    window.SettingsMicrophoneStream = null;

    try{
        var soundMeter = window.SettingsMicrophoneSoundMeter;
        soundMeter.stop();
    }
    catch(e){}   
    window.SettingsMicrophoneSoundMeter = null;
    
    // Speaker Preview
    try{
        window.SettingsOutputAudio.pause();
    }
    catch(e){}
    window.SettingsOutputAudio = null;

    try{
        var tracks = window.SettingsOutputStream.getTracks();
        tracks.forEach(function(track) {
            track.stop();
        });
    }
    catch(e){}
    window.SettingsOutputStream = null;

    try{
        var soundMeter = window.SettingsOutputStreamMeter;
        soundMeter.stop();
    }
    catch(e){}
    window.SettingsOutputStreamMeter = null;

    // Ringer Preview
    try{
        window.SettingsRingerAudio.pause();
    }
    catch(e){}
    window.SettingsRingerAudio = null;

    try{
        var tracks = window.SettingsRingerStream.getTracks();
        tracks.forEach(function(track) {
            track.stop();
        });
    }
    catch(e){}
    window.SettingsRingerStream = null;

    try{
        var soundMeter = window.SettingsRingerStreamMeter;
        soundMeter.stop();
    }
    catch(e){}
    window.SettingsRingerStreamMeter = null;

    $("#actionArea").hide();
    $("#actionArea").empty();
    $("#myContacts").show();
}

/* Primary Calling Method 
@param {string} type = (required) 
@param {Buddy} buddy = (optional) 
@param {sting} numToDial = (required) 
@param {string} CallerID = (optional) 
*/
 function DialByLine(type, buddy, numToDial, CallerID, extraHeaders){
    if(userAgent == null || userAgent.isRegistered() == false){
        ShowMyProfile();
        return;
    }

    var numDial = (numToDial)? numToDial : $("#dialText").val();
    if(EnableAlphanumericDial){
        numDial = numDial.replace(/[^\da-zA-Z\*\#\+]/g, "").substring(0,MaxDidLength);
    } 
    else {
        numDial = numDial.replace(/[^\d\*\#\+]/g, "").substring(0,MaxDidLength);
    }
    if(numDial.length == 0) {
        console.warn("Enter number to dial");
        return;
    }

    ShowContacts();

    // Create a Buddy if one is not already existing
    var buddyObj = (buddy)? FindBuddyByIdentity(buddy) : FindBuddyByDid(numDial);
    if(buddyObj == null) {
        var buddyType = (numDial.length > DidLength)? "contact" : "extension";
        if(buddyType.substring(0,1) == "*" || buddyType.substring(0,1) == "#") buddyType = "contact";
        buddyObj = MakeBuddy(buddyType, true, false, false, (CallerID)? CallerID : numDial, numDial);
    }

    // Create a Line
    newLineNumber = newLineNumber + 1;
    var lineObj = new Line(newLineNumber, buddyObj.CallerIDName, numDial, buddyObj);
    Lines.push(lineObj);
    AddLineHtml(lineObj);
    SelectLine(newLineNumber);
    UpdateBuddyList();

    // Start Call Invite
    if(type == "audio"){
        AudioCall(lineObj, numDial, extraHeaders);
    }

    try{
        $("#line-" + newLineNumber).get(0).scrollIntoViewIfNeeded();
    } catch(e){}
}

function SelectLine(lineNum){
    var lineObj = FindLineByNumber(lineNum);
    if(lineObj == null) return;
    
    var displayLineNumber = 0;
    for(var l = 0; l < Lines.length; l++) {
        if(Lines[l].LineNumber == lineObj.LineNumber) displayLineNumber = l+1;
        if(Lines[l].IsSelected == true && Lines[l].LineNumber == lineObj.LineNumber){
            // Nothing to do, you re-selected the same buddy;
            return;
        }
    }

    console.log("Selecting Line : "+ lineObj.LineNumber);

    // Can only display one thing on the Right
    $(".streamSelected").each(function () {
        $(this).prop('class', 'stream');
    });
    $("#line-ui-" + lineObj.LineNumber).prop('class', 'streamSelected');

    $("#line-ui-" + lineObj.LineNumber + "-DisplayLineNo").html("<i class=\"fa fa-phone\"></i> "+ lang.line +" "+ displayLineNumber);
    $("#line-ui-" + lineObj.LineNumber + "-LineIcon").html(displayLineNumber);

    // Switch the SIP Sessions
    SwitchLines(lineObj.LineNumber);

    // Update Lines List
    for(var l = 0; l < Lines.length; l++) {
        var classStr = (Lines[l].LineNumber == lineObj.LineNumber)? "buddySelected" : "buddy";
        if(Lines[l].SipSession != null) classStr = (Lines[l].SipSession.isOnHold)? "buddyActiveCallHollding" : "buddyActiveCall";

        $("#line-" + Lines[l].LineNumber).prop('class', classStr);
        Lines[l].IsSelected = (Lines[l].LineNumber == lineObj.LineNumber);
    }
    // Update Buddy List
    for(var b = 0; b < Buddies.length; b++) {
        $("#contact-" + Buddies[b].identity).prop("class", "buddy");
        Buddies[b].IsSelected = false;
    }

    // Change to Stream if in Narrow view
    UpdateUI();
}

function FindLineByNumber(lineNum) {
    for(var l = 0; l < Lines.length; l++) {
        if(Lines[l].LineNumber == lineNum) return Lines[l];
    }
    return null;
}

function AddLineHtml(lineObj){
    var html = "<table id=\"line-ui-"+ lineObj.LineNumber +"\" class=stream cellspacing=5 cellpadding=0>";
    html += "<tr><td class=streamSection style=\"height: 48px;\">";

    // Close|Return|Back Button
    html += "<div style=\"float:left; margin:0px; padding:5px; height:38px; line-height:38px\">"
    html += "<button id=\"line-"+ lineObj.LineNumber +"-btn-back\" onclick=\"CloseLine('"+ lineObj.LineNumber +"')\" class=roundButtons title=\""+ lang.back +"\"><i class=\"fa fa-chevron-left\"></i></button> ";
    html += "</div>"

    // Profile UI
    html += "<div class=contact style=\"cursor: unset; float: left;\">";
    html += "<div id=\"line-ui-"+ lineObj.LineNumber +"-LineIcon\" class=lineIcon>"+ lineObj.LineNumber +"</div>";
    html += "<div id=\"line-ui-"+ lineObj.LineNumber +"-DisplayLineNo\" class=contactNameText><i class=\"fa fa-phone\"></i> "+ lang.line +" "+ lineObj.LineNumber +"</div>";
    html += "<div class=presenceText>"+ lineObj.DisplayName +" <"+ lineObj.DisplayNumber +"></div>";
    html += "</div>";

    // Separator 
    html += "<div style=\"clear:both; height:0px\"></div>"

    // Calling UI 
    html += "<div id=\"line-"+ lineObj.LineNumber +"-calling\">";

    // Gneral Messages
    html += "<div id=\"line-"+ lineObj.LineNumber +"-timer\" style=\"float: right; margin-top: 5px; margin-right: 10px; display:none;\"></div>";
    html += "<div id=\"line-"+ lineObj.LineNumber +"-msg\" class=callStatus style=\"display:none\">...</div>";

    // Call Answer UI
    html += "<div id=\"line-"+ lineObj.LineNumber +"-AnswerCall\" class=answerCall style=\"display:none\">";
    html += "<div>";
    html += "<button onclick=\"AnswerAudioCall('"+ lineObj.LineNumber +"')\" class=answerButton><i class=\"fa fa-phone\"></i> "+ lang.answer_call +"</button> ";
    html += "<button onclick=\"RejectCall('"+ lineObj.LineNumber +"')\" class=hangupButton><i class=\"fa fa-phone\" style=\"transform: rotate(135deg);\"></i> "+ lang.reject_call +"</button> ";
    html += "</div>";
    html += "</div>";

    // Dialing Out Progress
    html += "<div id=\"line-"+ lineObj.LineNumber +"-progress\" style=\"display:none; margin-top: 10px\">";
    html += "<div class=progressCall>";
    html += "<button onclick=\"cancelSession('"+ lineObj.LineNumber +"')\" class=hangupButton><i class=\"fa fa-phone\" style=\"transform: rotate(135deg);\"></i> "+ lang.cancel +"</button>";
    html += "</div>";
    html += "</div>";

    // Active Call UI
    html += "<div id=\"line-"+ lineObj.LineNumber +"-ActiveCall\" style=\"display:none; margin-top: 10px;\">";

    // Audio Call
    html += "<div id=\"line-"+ lineObj.LineNumber +"-AudioCall\" style=\"display:none;\">";
    html += "<audio id=\"line-"+ lineObj.LineNumber+"-remoteAudio\"></audio>";
    html += "</div>";

    // In Call Container
    html += "<div style=\"text-align:center\">";

    // In Call Buttons
    html += "<div id=\"line-"+ lineObj.LineNumber +"-call-control\" class=CallControl>";
    html += "<button id=\"line-"+ lineObj.LineNumber +"-btn-ShowDtmf\" onclick=\"ShowDtmfMenu(this, '"+ lineObj.LineNumber +"')\" class=\"roundButtons inCallButtons\" title=\""+ lang.show_key_pad +"\"><i class=\"fa fa-keyboard-o\"></i></button>";
    html += "<button id=\"line-"+ lineObj.LineNumber +"-btn-Mute\" onclick=\"MuteSession('"+ lineObj.LineNumber +"')\" class=\"roundButtons inCallButtons\" title=\""+ lang.mute +"\"><i class=\"fa fa-microphone-slash\"></i></button>";
    html += "<button id=\"line-"+ lineObj.LineNumber +"-btn-Unmute\" onclick=\"UnmuteSession('"+ lineObj.LineNumber +"')\" class=\"roundButtons inCallButtons\" title=\""+ lang.unmute +"\" style=\"color: red; display:none\"><i class=\"fa fa-microphone\"></i></button>";
    if(typeof MediaRecorder != "undefined" && (CallRecordingPolicy == "allow" || CallRecordingPolicy == "enabled")){
        // Safari: must enable in Develop > Experimental Features > MediaRecorder
        html += "<button id=\"line-"+ lineObj.LineNumber +"-btn-start-recording\" onclick=\"StartRecording('"+ lineObj.LineNumber +"')\" class=\"roundButtons inCallButtons\" title=\""+ lang.start_call_recording +"\"><i class=\"fa fa-dot-circle-o\"></i></button>";
        html += "<button id=\"line-"+ lineObj.LineNumber +"-btn-stop-recording\" onclick=\"StopRecording('"+ lineObj.LineNumber +"')\" class=\"roundButtons inCallButtons\" title=\""+ lang.stop_call_recording +"\" style=\"color: red; display:none\"><i class=\"fa fa-circle\"></i></button>";
    }
    if(EnableTransfer){
        html += "<button id=\"line-"+ lineObj.LineNumber +"-btn-Transfer\" onclick=\"StartTransferSession('"+ lineObj.LineNumber +"')\" class=\"roundButtons inCallButtons\" title=\""+ lang.transfer_call +"\"><i class=\"fa fa-reply\" style=\"transform: rotateY(180deg)\"></i></button>";
        html += "<button id=\"line-"+ lineObj.LineNumber+"-btn-CancelTransfer\" onclick=\"CancelTransferSession('"+ lineObj.LineNumber +"')\" class=\"roundButtons inCallButtons\" title=\""+ lang.cancel_transfer +"\" style=\"color: red; display:none\"><i class=\"fa fa-reply\" style=\"transform: rotateY(180deg)\"></i></button>";
    }
    if(EnableConference){
        html += "<button id=\"line-"+ lineObj.LineNumber +"-btn-Conference\" onclick=\"StartConferenceCall('"+ lineObj.LineNumber +"')\" class=\"roundButtons inCallButtons\" title=\""+ lang.conference_call +"\"><i class=\"fa fa-users\"></i></button>";
        html += "<button id=\"line-"+ lineObj.LineNumber +"-btn-CancelConference\" onclick=\"CancelConference('"+ lineObj.LineNumber +"')\" class=\"roundButtons inCallButtons\" title=\""+ lang.cancel_conference +"\" style=\"color: red; display:none\"><i class=\"fa fa-users\"></i></button>";
    }
    html += "<button id=\"line-"+ lineObj.LineNumber +"-btn-Hold\" onclick=\"holdSession('"+ lineObj.LineNumber +"')\" class=\"roundButtons inCallButtons\"  title=\""+ lang.hold_call +"\"><i class=\"fa fa-pause-circle\"></i></button>";
    html += "<button id=\"line-"+ lineObj.LineNumber +"-btn-Unhold\" onclick=\"unholdSession('"+ lineObj.LineNumber +"')\" class=\"roundButtons inCallButtons\" title=\""+ lang.resume_call +"\" style=\"color: red; display:none\"><i class=\"fa fa-play-circle\"></i></button>";
    html += "<button id=\"line-"+ lineObj.LineNumber +"-btn-End\" onclick=\"endSession('"+ lineObj.LineNumber +"')\" class=\"roundButtons inCallButtons hangupButton\" title=\""+ lang.end_call +"\"><i class=\"fa fa-phone\" style=\"transform: rotate(135deg);\"></i></button>";
    html += "</div>";

    // DTMF
    html += "<div id=\"line-"+ lineObj.LineNumber +"-Dialpad\" style=\"display:none; margin-top:15px; margin-bottom:15px\">";
    html += "<table cellspacing=10 cellpadding=0 style=\"margin-left:auto; margin-right: auto\">";
    html += "<tr><td><button class=dtmfButtons onclick=\"sendDTMF('"+ lineObj.LineNumber +"', '1')\"><div>1</div><span>&nbsp;</span></button></td>"
    html += "<td><button class=dtmfButtons onclick=\"sendDTMF('"+ lineObj.LineNumber +"', '2')\"><div>2</div><span>ABC</span></button></td>"
    html += "<td><button class=dtmfButtons onclick=\"sendDTMF('"+ lineObj.LineNumber +"', '3')\"><div>3</div><span>DEF</span></button></td></tr>";
    html += "<tr><td><button class=dtmfButtons onclick=\"sendDTMF('"+ lineObj.LineNumber +"', '4')\"><div>4</div><span>GHI</span></button></td>"
    html += "<td><button class=dtmfButtons onclick=\"sendDTMF('"+ lineObj.LineNumber +"', '5')\"><div>5</div><span>JKL</span></button></td>"
    html += "<td><button class=dtmfButtons onclick=\"sendDTMF('"+ lineObj.LineNumber +"', '6')\"><div>6</div><span>MNO</span></button></td></tr>";
    html += "<tr><td><button class=dtmfButtons onclick=\"sendDTMF('"+ lineObj.LineNumber +"', '7')\"><div>7</div><span>PQRS</span></button></td>"
    html += "<td><button class=dtmfButtons onclick=\"sendDTMF('"+ lineObj.LineNumber +"', '8')\"><div>8</div><span>TUV</span></button></td>"
    html += "<td><button class=dtmfButtons onclick=\"sendDTMF('"+ lineObj.LineNumber +"', '9')\"><div>9</div><span>WXYZ</span></button></td></tr>";
    html += "<tr><td><button class=dtmfButtons onclick=\"sendDTMF('"+ lineObj.LineNumber +"', '*')\">*</button></td>"
    html += "<td><button class=dtmfButtons onclick=\"sendDTMF('"+ lineObj.LineNumber +"', '0')\">0</button></td>"
    html += "<td><button class=dtmfButtons onclick=\"sendDTMF('"+ lineObj.LineNumber +"', '#')\">#</button></td></tr>";
    html += "</table>";
    html += "</div>";

    // Call Transfer
    html += "<div id=\"line-"+ lineObj.LineNumber +"-Transfer\" style=\"display:none\">";
    html += "<div style=\"margin-top:10px\">";
    html += "<span class=searchClean><input id=\"line-"+ lineObj.LineNumber +"-txt-FindTransferBuddy\" oninput=\"QuickFindBuddy(this,'"+ lineObj.LineNumber +"')\" type=text autocomplete=none style=\"width:150px;\" autocomplete=none placeholder=\""+ lang.search_or_enter_number +"\"></span>";
    html += " <button id=\"line-"+ lineObj.LineNumber +"-btn-blind-transfer\" onclick=\"BlindTransfer('"+ lineObj.LineNumber +"')\"><i class=\"fa fa-reply\" style=\"transform: rotateY(180deg)\"></i> "+ lang.blind_transfer +"</button>"
    html += " <button id=\"line-"+ lineObj.LineNumber +"-btn-attended-transfer\" onclick=\"AttendedTransfer('"+ lineObj.LineNumber +"')\"><i class=\"fa fa-reply-all\" style=\"transform: rotateY(180deg)\"></i> "+ lang.attended_transfer +"</button>";
    html += " <button id=\"line-"+ lineObj.LineNumber +"-btn-complete-attended-transfer\" style=\"display:none\"><i class=\"fa fa-reply-all\" style=\"transform: rotateY(180deg)\"></i> "+ lang.complete_transfer +"</buuton>";
    html += " <button id=\"line-"+ lineObj.LineNumber +"-btn-cancel-attended-transfer\" style=\"display:none\"><i class=\"fa fa-phone\" style=\"transform: rotate(135deg);\"></i> "+ lang.cancel_transfer +"</buuton>";
    html += " <button id=\"line-"+ lineObj.LineNumber +"-btn-terminate-attended-transfer\" style=\"display:none\"><i class=\"fa fa-phone\" style=\"transform: rotate(135deg);\"></i> "+ lang.end_transfer_call +"</buuton>";
    html += "</div>";
    html += "<div id=\"line-"+ lineObj.LineNumber +"-transfer-status\" class=callStatus style=\"margin-top:10px; display:none\">...</div>";
    html += "<audio id=\"line-"+ lineObj.LineNumber +"-transfer-remoteAudio\" style=\"display:none\"></audio>";
    html += "</div>";
    
    // Monitoring
    html += "<div  id=\"line-"+ lineObj.LineNumber +"-monitoring\" style=\"margin-top:10px\">";
    html += "<span style=\"vertical-align: middle\"><i class=\"fa fa-microphone\"></i></span> ";
    html += "<span class=meterContainer title=\""+ lang.microphone_levels +"\">";
    html += "<span id=\"line-"+ lineObj.LineNumber +"-Mic\" class=meterLevel style=\"height:0%\"></span>";
    html += "</span> ";
    html += "<span style=\"vertical-align: middle\"><i class=\"fa fa-volume-up\"></i></span> ";
    html += "<span class=meterContainer title=\""+ lang.speaker_levels +"\">";
    html += "<span id=\"line-"+ lineObj.LineNumber +"-Speaker\" class=meterLevel style=\"height:0%\"></span>";
    html += "</span> ";
    html += "<button id=\"line-"+ lineObj.LineNumber +"-btn-settings\" onclick=\"ChangeSettings('"+ lineObj.LineNumber +"', this)\"><i class=\"fa fa-cogs\"></i> "+ lang.device_settings +"</button>";
    html += "<button id=\"line-"+ lineObj.LineNumber +"-call-stats\" onclick=\"ShowCallStats('"+ lineObj.LineNumber +"', this)\"><i class=\"fa fa-area-chart\"></i> "+ lang.call_stats +"</button>";
    html += "</div>";

    html += "<div id=\"line-"+ lineObj.LineNumber +"-AdioStats\" class=\"audioStats cleanScroller\" style=\"display:none\">";
    html += "<div style=\"text-align:right\"><button onclick=\"HideCallStats('"+ lineObj.LineNumber +"', this)\"><i class=\"fa fa-times\"></i></button></div>";
    html += "<fieldset class=audioStatsSet>";
    html += "<legend>"+ lang.send_statistics +"</legend>";
    html += "<canvas id=\"line-"+ lineObj.LineNumber +"-AudioSendBitRate\" class=audioGraph width=600 height=160 style=\"width:600px; height:160px\"></canvas>";
    html += "<canvas id=\"line-"+ lineObj.LineNumber +"-AudioSendPacketRate\" class=audioGraph width=600 height=160 style=\"width:600px; height:160px\"></canvas>";
    html += "</fieldset>";
    html += "<fieldset class=audioStatsSet>";
    html += "<legend>"+ lang.receive_statistics +"</legend>";
    html += "<canvas id=\"line-"+ lineObj.LineNumber +"-AudioReceiveBitRate\" class=audioGraph width=600 height=160 style=\"width:600px; height:160px\"></canvas>";
    html += "<canvas id=\"line-"+ lineObj.LineNumber +"-AudioReceivePacketRate\" class=audioGraph width=600 height=160 style=\"width:600px; height:160px\"></canvas>";
    html += "<canvas id=\"line-"+ lineObj.LineNumber +"-AudioReceivePacketLoss\" class=audioGraph width=600 height=160 style=\"width:600px; height:160px\"></canvas>";
    html += "<canvas id=\"line-"+ lineObj.LineNumber +"-AudioReceiveJitter\" class=audioGraph width=600 height=160 style=\"width:600px; height:160px\"></canvas>";
    html += "<canvas id=\"line-"+ lineObj.LineNumber +"-AudioReceiveLevels\" class=audioGraph width=600 height=160 style=\"width:600px; height:160px\"></canvas>";
    html += "</fieldset>";
    html += "</div>";

    html += "</div>";
    html += "</div>";
    html += "</div>";

    html += "</td></tr>";
    html += "<tr><td class=\"streamSection streamSectionBackground\" style=\"background-image:url('"+ hostingPrefex +"wp_1.png')\">";
    
    html += "<div id=\"line-"+ lineObj.LineNumber +"-CallDetails\" class=\"chatHistory cleanScroller\">";
    // In Call Activity
    html += "</div>";

    html += "</td></tr>";
    html += "</table>";

    $("#rightContent").append(html);
}

function RemoveLine(lineObj){
    if(lineObj == null) return;

    var earlyReject = lineObj.SipSession.data.earlyReject;
    for(var l = 0; l < Lines.length; l++) {
        if(Lines[l].LineNumber == lineObj.LineNumber) {
            Lines.splice(l,1);
            break;
        }
    }

    if(earlyReject != true){
        CloseLine(lineObj.LineNumber);
        $("#line-ui-"+ lineObj.LineNumber).remove();
    }

    UpdateBuddyList();

    if(earlyReject != true){
        // Rather than showing nothing, go to the last Buddy Selected
        // Select Last user
        if(localDB.getItem("SelectedBuddy") != null){
            console.log("Selecting previously selected buddy...", localDB.getItem("SelectedBuddy"));
            SelectBuddy(localDB.getItem("SelectedBuddy"));
            UpdateUI();
        }
    } 
}

function CloseLine(lineNum){
    // Lines and Buddies (Left)
    $(".buddySelected").each(function () {
        $(this).prop('class', 'buddy');
    });
    // Streams (Right)
    $(".streamSelected").each(function () {
        $(this).prop('class', 'stream');
    });

    // SwitchLines(0);

    console.log("Closing Line: "+ lineNum);
    for(var l = 0; l < Lines.length; l++){
        Lines[l].IsSelected = false;
    }
    selectedLine = null;
    for(var b = 0; b < Buddies.length; b++){
        Buddies[b].IsSelected = false;
    }
    selectedBuddy = null;

    UpdateUI();
}

function SwitchLines(lineNum){
    $.each(userAgent.sessions, function (i, session) {
        // All the other calls, not on hold
        if(session.state == SIP.SessionState.Established){
            if(session.isOnHold == false && session.data.line != lineNum) {
                holdSession(session.data.line);
            }
        }
        session.data.IsCurrentCall = false;
    });

    var lineObj = FindLineByNumber(lineNum);
    if(lineObj != null && lineObj.SipSession != null) {
        var session = lineObj.SipSession;
        if(session.state == SIP.SessionState.Established){
            if(session.isOnHold == true) {
                unholdSession(lineNum)
            }
        }
        session.data.IsCurrentCall = true;
    }
    selectedLine = lineNum;

    RefreshLineActivity(lineNum);
}

function RefreshLineActivity(lineNum){
    var lineObj = FindLineByNumber(lineNum);
    if(lineObj == null || lineObj.SipSession == null) {
        return;
    }
    var session = lineObj.SipSession;

    $("#line-"+ lineNum +"-CallDetails").empty();

    var callDetails = [];

    var ringTime = 0;
    var CallStart = moment.utc(session.data.callstart.replace(" UTC", ""));
    var CallAnswer = null;
    if(session.data.startTime){
        CallAnswer = moment.utc(session.data.startTime);
        ringTime = moment.duration(CallAnswer.diff(CallStart));
    }
    CallStart = CallStart.format("YYYY-MM-DD HH:mm:ss UTC")
    CallAnswer = (CallAnswer)? CallAnswer.format("YYYY-MM-DD HH:mm:ss UTC") : null,
    ringTime = (ringTime != 0)? ringTime.asSeconds() : 0

    var srcCallerID = "";
    var dstCallerID = "";
    if(session.data.calldirection == "inbound") {
        srcCallerID = "<"+ session.remoteIdentity.uri.user +"> "+ session.remoteIdentity.displayName;
    } 
    else if(session.data.calldirection == "outbound") {
        dstCallerID = session.data.dst;
    }

    if(CallAnswer){
        var answerCallMessage = (session.data.calldirection == "inbound")? lang.you_answered_after + " " + ringTime + " " + lang.seconds_plural : lang.they_answered_after + " " + ringTime + " " + lang.seconds_plural;
        callDetails.push({ 
            Message: answerCallMessage,
            TimeStr : CallAnswer
        });
    }

    var Transfers = (session.data.transfer)? session.data.transfer : [];
    $.each(Transfers, function(item, transfer){
        var msg = (transfer.type == "Blind")? lang.you_started_a_blind_transfer_to +" "+ transfer.to +". " : lang.you_started_an_attended_transfer_to + " "+ transfer.to +". ";
        if(transfer.accept && transfer.accept.complete == true){
            msg += lang.the_call_was_completed
        }
        else if(transfer.accept.disposition != "") {
            msg += lang.the_call_was_not_completed +" ("+ transfer.accept.disposition +")"
        }
        callDetails.push({
            Message : msg,
            TimeStr : transfer.transferTime
        });
    });

    var Mutes = (session.data.mute)? session.data.mute : []
    $.each(Mutes, function(item, mute){
        callDetails.push({
            Message : (mute.event == "mute")? lang.you_put_the_call_on_mute : lang.you_took_the_call_off_mute,
            TimeStr : mute.eventTime
        });
    });

    var Holds = (session.data.hold)? session.data.hold : []
    $.each(Holds, function(item, hold){
        callDetails.push({
            Message : (hold.event == "hold")? lang.you_put_the_call_on_hold : lang.you_took_the_call_off_hold,
            TimeStr : hold.eventTime
        });
    });

    callDetails.sort(function(a, b){
        var aMo = moment.utc(a.TimeStr.replace(" UTC", ""));
        var bMo = moment.utc(b.TimeStr.replace(" UTC", ""));
        if (aMo.isSameOrAfter(bMo, "second")) {
            return -1;
        } else return 1;
        return 0;
    });

    $.each(callDetails, function(item, detail){
        var Time = moment.utc(detail.TimeStr.replace(" UTC", "")).local().format(DisplayTimeFormat);
        var messageString = "<table class=timelineMessage cellspacing=0 cellpadding=0><tr>"
        messageString += "<td class=timelineMessageArea>"
        messageString += "<div class=timelineMessageDate><i class=\"fa fa-circle timelineMessageDot\"></i>"+ Time +"</div>"
        messageString += "<div class=timelineMessageText>"+ detail.Message +"</div>"
        messageString += "</td>"
        messageString += "</tr></table>";
        $("#line-"+ lineNum +"-CallDetails").prepend(messageString);
    });
}

/* Contacts & Extensions 
=========================== */
var Buddy = function(type, identity, CallerIDName, ExtNo, MobileNumber, lastActivity, desc, Email, jid, dnd, subscribe){
    this.type = type; // extension | contact | group
    this.identity = identity;
    this.jid = jid;
    this.CallerIDName = (CallerIDName)? CallerIDName : "";
    this.Email = Email;
    this.Desc = desc;
    this.ExtNo = ExtNo;
    this.MobileNumber = MobileNumber;
    this.lastActivity = lastActivity; // Full Date as string eg "1208-03-21 15:34:23 UTC"
    this.devState = "dotOffline";
    this.presence = "Unknown";
    this.missed = 0;
    this.IsSelected = false;
    this.imageObjectURL = "";
    this.presenceText = lang.default_status;
    this.EnableDuringDnd = dnd;
    this.EnableSubscribe = subscribe;
}

function InitUserBuddies(){
    var template = { TotalRows:0, DataCollection:[] }
    localDB.setItem(profileUserID + "-Buddies", JSON.stringify(template));
    return JSON.parse(localDB.getItem(profileUserID + "-Buddies"));
}

function MakeBuddy(type, update, focus, subscribe, callerID, did, jid, AllowDuringDnd){
    var json = JSON.parse(localDB.getItem(profileUserID + "-Buddies"));
    if(json == null) json = InitUserBuddies();

    var dateNow = utcDateNow();
    var buddyObj = null;
    var id = uID();

    if(type == "extension") {
        json.DataCollection.push({
            Type: "extension",
            LastActivity: dateNow,
            ExtensionNumber: did,
            MobileNumber: "",
            uID: id,
            cID: null,
            gID: null,
            jid: null,
            DisplayName: callerID,
            Description: "", 
            Email: "",
            MemberCount: 0,
            EnableDuringDnd: AllowDuringDnd,
            Subscribe: subscribe
        });
        buddyObj = new Buddy("extension", id, callerID, did, "", "", "", dateNow, "", "", null, AllowDuringDnd, subscribe);
        AddBuddy(buddyObj, update, focus, subscribe);
    }
    if(type == "contact"){
        json.DataCollection.push({
            Type: "contact", 
            LastActivity: dateNow,
            ExtensionNumber: "", 
            MobileNumber: did,
            uID: null,
            cID: id,
            gID: null,
            jid: null,
            DisplayName: callerID,
            Description: "",
            Email: "",
            MemberCount: 0,
            EnableDuringDnd: AllowDuringDnd,
            Subscribe: false
        });
        buddyObj = new Buddy("contact", id, callerID, "", "", did, "", dateNow, "", "", null, AllowDuringDnd, false);
        AddBuddy(buddyObj, update, focus, false);
    }

    // Update Size: 
    json.TotalRows = json.DataCollection.length;

    // Save To DB
    localDB.setItem(profileUserID + "-Buddies", JSON.stringify(json));

    // Return new buddy
    return buddyObj;
}

function UpdateBuddyCalerID(buddyObj, callerID){
    buddyObj.CallerIDName = callerID;

    var buddy = buddyObj.identity;
    // Update DB
    var json = JSON.parse(localDB.getItem(profileUserID + "-Buddies"));
    if(json != null){
        $.each(json.DataCollection, function (i, item) {
            if(item.uID == buddy || item.cID == buddy || item.gID == buddy){
                item.DisplayName = callerID;
                return false;
            }
        });
        // Save To DB
        localDB.setItem(profileUserID + "-Buddies", JSON.stringify(json));
    }

    UpdateBuddyList();
}

function AddBuddy(buddyObj, update, focus, subscribe){
    Buddies.push(buddyObj);
    if(update == true) UpdateBuddyList();
    AddBuddyMessageStream(buddyObj);
    if(subscribe == true) SubscribeBuddy(buddyObj);
    if(focus == true) SelectBuddy(buddyObj.identity);
}
function PopulateBuddyList() {
    console.log("Clearing Buddies...");
    Buddies = new Array();
    console.log("Adding Buddies...");
    var json = JSON.parse(localDB.getItem(profileUserID + "-Buddies"));
    if(json == null) return;

    console.log("Total Buddies: " + json.TotalRows);
    $.each(json.DataCollection, function (i, item) {
        if(item.Type == "extension"){
            // extension
            var buddy = new Buddy("extension", item.uID, item.DisplayName, item.ExtensionNumber, item.MobileNumber, item.ContactNumber1, item.ContactNumber2, item.LastActivity, item.Description, item.Email, null, item.EnableDuringDnd, item.Subscribe);
            AddBuddy(buddy, false, false, false);
        }
        else if(item.Type == "contact"){
            // contact
            var buddy = new Buddy("contact", item.cID, item.DisplayName, "", item.MobileNumber, item.ContactNumber1, item.ContactNumber2, item.LastActivity, item.Description, item.Email, null, item.EnableDuringDnd, item.Subscribe);
            AddBuddy(buddy, false, false, false);
        }
    });

    // Update List (after add)
    console.log("Updating Buddy List...");
    UpdateBuddyList();
}

function UpdateBuddyList(){
    var filter = $("#txtFindBuddy").val();

    $("#myContacts").empty();

    // Show Lines
    var callCount = 0
    for(var l = 0; l < Lines.length; l++) {

        var classStr = (Lines[l].IsSelected)? "buddySelected" : "buddy";
        if(Lines[l].SipSession != null) classStr = (Lines[l].SipSession.isOnHold)? "buddyActiveCallHollding" : "buddyActiveCall";

        var html = "<div id=\"line-"+ Lines[l].LineNumber +"\" class="+ classStr +" onclick=\"SelectLine('"+ Lines[l].LineNumber +"')\">";
        html += "<div class=lineIcon>"+ (l + 1) +"</div>";
        html += "<div class=contactNameText><i class=\"fa fa-phone\"></i> "+ lang.line +" "+ (l + 1) +"</div>";
        html += "<div id=\"Line-"+ Lines[l].ExtNo +"-datetime\" class=contactDate>&nbsp;</div>";
        html += "<div class=presenceText>"+ Lines[l].DisplayName +" <"+ Lines[l].DisplayNumber +">" +"</div>";
        html += "</div>";
        // SIP.Session.C.STATUS_TERMINATED
        if(Lines[l].SipSession && Lines[l].SipSession.data.earlyReject != true){
            $("#myContacts").append(html);
            callCount ++;
        }
    }

    // End here if they are not using the buddy system
    if(DisableBuddies == true){
        // If there are no calls, this could look fi=unny
        if(callCount == 0){
            ShowDial();
        }
        return;
    }

    // Draw a line if there are calls
    if(callCount > 0){
        $("#myContacts").append("<hr style=\"height:1px; background-color:#696969\">");
    }

    
    // Sort and shuffle Buddy List
    // ===========================
    Buddies.sort(function(a, b){
        var aMo = moment.utc(a.lastActivity.replace(" UTC", ""));
        var bMo = moment.utc(b.lastActivity.replace(" UTC", ""));
        if (aMo.isSameOrAfter(bMo, "second")) {
            return -1;
        } else return 1;
        return 0;
    });

    for(var b = 0; b < Buddies.length; b++) {
        var buddyObj = Buddies[b];

        if(filter && filter.length >= 1){
            // Perform Filter Display
            var display = false;
            if(buddyObj.CallerIDName.toLowerCase().indexOf(filter.toLowerCase()) > -1 ) display = true;
            if(buddyObj.ExtNo.toLowerCase().indexOf(filter.toLowerCase()) > -1 ) display = true;
            if(buddyObj.Desc.toLowerCase().indexOf(filter.toLowerCase()) > -1 ) display = true;
            if(!display) continue;
        }

        var today = moment.utc();
        var lastActivity = moment.utc(buddyObj.lastActivity.replace(" UTC", ""));
        var displayDateTime = "";
        if(lastActivity.isSame(today, 'day'))
        {
            displayDateTime = lastActivity.local().format(DisplayTimeFormat);
        } 
        else {
            displayDateTime = lastActivity.local().format(DisplayDateFormat);
        }

        var classStr = (buddyObj.IsSelected)? "buddySelected" : "buddy";
        if(buddyObj.type == "extension") { 
            var friendlyState = buddyObj.presence;
            if(friendlyState == "Unknown") friendlyState = lang.state_unknown;
            if(friendlyState == "Not online") friendlyState = lang.state_not_online;
            if(friendlyState == "Ready") friendlyState = lang.state_ready;
            if(friendlyState == "On the phone") friendlyState = lang.state_on_the_phone;
            if(friendlyState == "Ringing") friendlyState = lang.state_ringing;
            if(friendlyState == "On hold") friendlyState = lang.state_on_hold;
            if(friendlyState == "Unavailable") friendlyState = lang.state_unavailable;
            if(buddyObj.EnableSubscribe != true) friendlyState = buddyObj.Desc;
            var html = "<div id=\"contact-"+ buddyObj.identity +"\" class="+ classStr +" onclick=\"SelectBuddy('"+ buddyObj.identity +"', 'extension')\">";
            if(buddyObj.missed && buddyObj.missed > 0){
                html += "<span id=\"contact-"+ buddyObj.identity +"-missed\" class=missedNotifyer>"+ buddyObj.missed +"</span>";
            }
            else{
                html += "<span id=\"contact-"+ buddyObj.identity +"-missed\" class=missedNotifyer style=\"display:none\">"+ buddyObj.missed +"</span>";
            }
            html += "<div class=buddyIcon style=\"background-image: url('"+ getPicture(buddyObj.identity, buddyObj.type) +"')\"></div>";
            html += "<div class=contactNameText>";
            html += "<span id=\"contact-"+ buddyObj.identity +"-devstate\" class=\""+ buddyObj.devState +"\"></span>";
            html += " "+ buddyObj.ExtNo +" - "+ buddyObj.CallerIDName
            html += "</div>";
            html += "<div id=\"contact-"+ buddyObj.identity +"-datetime\" class=contactDate>"+ displayDateTime +"</div>";
            html += "<div id=\"contact-"+ buddyObj.identity +"-presence\" class=presenceText>"+ friendlyState +"</div>";
            html += "</div>";
            $("#myContacts").append(html);
        } else if(buddyObj.type == "contact") { 
            var html = "<div id=\"contact-"+ buddyObj.identity +"\" class="+ classStr +" onclick=\"SelectBuddy('"+ buddyObj.identity +"', 'contact')\">";
            if(buddyObj.missed && buddyObj.missed > 0){
                html += "<span id=\"contact-"+ buddyObj.identity +"-missed\" class=missedNotifyer>"+ buddyObj.missed +"</span>";
            }
            else{
                html += "<span id=\"contact-"+ buddyObj.identity +"-missed\" class=missedNotifyer style=\"display:none\">"+ buddyObj.missed +"</span>";
            }
            html += "<div class=buddyIcon style=\"background-image: url('"+ getPicture(buddyObj.identity, buddyObj.type) +"')\"></div>";
            html += "<div class=contactNameText><i class=\"fa fa-address-card\"></i> "+ buddyObj.CallerIDName +"</div>";
            html += "<div id=\"contact-"+ buddyObj.identity +"-datetime\" class=contactDate>"+ displayDateTime +"</div>";
            html += "<div class=presenceText>"+ buddyObj.Desc +"</div>";
            html += "</div>";
            $("#myContacts").append(html);
        }
    }

    // Make Selection
    for(var b = 0; b < Buddies.length; b++) {
        if(Buddies[b].IsSelected) {
            SelectBuddy(Buddies[b].identity, Buddies[b].type);
            break;
        }
    }
}

function AddBuddyMessageStream(buddyObj) {
    var html = "<table id=\"stream-"+ buddyObj.identity +"\" class=stream cellspacing=5 cellpadding=0>";
    html += "<tr><td class=streamSection style=\"height: 48px;\">";

    // Left Content - Profile
    html += "<div style=\"float: left; height: 48px;\">";

    html += "<table cellpadding=0 cellspacing=0 border=0><tr><td>";

    // Close|Return|Back Button
    html += "<button id=\"contact-"+ buddyObj.identity +"-btn-back\" onclick=\"CloseBuddy('"+ buddyObj.identity +"')\" class=roundButtons title=\""+ lang.back +"\"><i class=\"fa fa-chevron-left\"></i></button> ";

    html += "</td><td>";

    // Profile UI
    html += "<div class=contact style=\"cursor: unset\">";

    if(buddyObj.type == "contact") {
        html += "<div id=\"contact-"+ buddyObj.identity +"-picture-main\" class=buddyIcon style=\"background-image: url('"+ getPicture(buddyObj.identity,"contact") +"')\"></div>";
    }

    if(buddyObj.type == "contact") {
        html += "<div class=contactNameText style=\"margin-right: 0px;\"><i class=\"fa fa-address-card\"></i> "+ buddyObj.CallerIDName +"</div>";
    }

    if(buddyObj.type == "extension") {
        var friendlyState = buddyObj.presence;
        if (friendlyState == "Unknown") friendlyState = lang.state_unknown;
        if (friendlyState == "Not online") friendlyState = lang.state_not_online;
        if (friendlyState == "Ready") friendlyState = lang.state_ready;
        if (friendlyState == "On the phone") friendlyState = lang.state_on_the_phone;
        if (friendlyState == "Ringing") friendlyState = lang.state_ringing;
        if (friendlyState == "On hold") friendlyState = lang.state_on_hold;
        if (friendlyState == "Unavailable") friendlyState = lang.state_unavailable;
        html += "<div id=\"contact-"+ buddyObj.identity +"-presence-main\" class=presenceText>"+ friendlyState +"</div>";
    }
    else{
        html += "<div id=\"contact-"+ buddyObj.identity +"-presence-main\" class=presenceText>"+ buddyObj.Desc +"</div>";
    }
    html += "</div>";

    html += "</td></tr></table>";

    html += "</div>";

    // Right Content - Action Buttons
    html += "<div style=\"float:right; height: 48px; line-height: 48px;\">";
    html += "<button id=\"contact-"+ buddyObj.identity +"-btn-audioCall\" onclick=\"AudioCallMenu('"+ buddyObj.identity +"', this)\" class=roundButtons title=\""+ lang.audio_call +"\"><i class=\"fa fa-phone\"></i></button> ";
    html += "<button id=\"contact-"+ buddyObj.identity +"-btn-edit\" onclick=\"EditBuddyWindow('"+ buddyObj.identity +"')\" class=roundButtons title=\""+ lang.edit +"\"><i class=\"fa fa-pencil\"></i></button> ";
    html += "<button id=\"contact-"+ buddyObj.identity +"-btn-search\" onclick=\"FindSomething('"+ buddyObj.identity +"')\" class=roundButtons title=\""+ lang.find_something +"\"><i class=\"fa fa-search\"></i></button> ";
    html += "<button id=\"contact-"+ buddyObj.identity +"-btn-remove\" onclick=\"RemoveBuddy('"+ buddyObj.identity +"')\" class=roundButtons title=\""+ lang.remove +"\"><i class=\"fa fa-trash\"></i></button> ";
    html += "</div>";

    // Separator
    html += "<div style=\"clear:both; height:0px\"></div>"

    // Search & Related Elements
    html += "<div id=\"contact-"+ buddyObj.identity +"-search\" style=\"margin-top:6px; display:none\">";
    html += "<span class=searchClean style=\"width:100%\"><input type=text style=\"width:90%\" autocomplete=none oninput=SearchStream(this,'"+ buddyObj.identity +"') placeholder=\""+ lang.find_something_in_the_message_stream +"\"></span>";
    html += "</div>";

    html += "</td></tr>";
    html += "<tr><td class=\"streamSection streamSectionBackground\" style=\"background-image:url('"+ hostingPrefex +"wp_1.png')\">";
}

function MakeUpName(){
    var shortname = 4;
    var longName = 12;
    var letters = ["A","B","C","D","E","F","G","H","I","J","K","L","M","N","O","P","Q","R","S","T","U","V","W","X","Y","Z"];
    var rtn = "";
    rtn += letters[Math.floor(Math.random() * letters.length)];
    for(var n=0; n<Math.floor(Math.random() * longName) + shortname; n++){
        rtn += letters[Math.floor(Math.random() * letters.length)].toLowerCase();
    }
    rtn += " ";
    rtn += letters[Math.floor(Math.random() * letters.length)];
    for(var n=0; n<Math.floor(Math.random() * longName) + shortname; n++){
        rtn += letters[Math.floor(Math.random() * letters.length)].toLowerCase();
    }
    return rtn;
}

function MakeUpNumber(){
    var numbers = ["0","1","2","3","4","5","6","7","8","9","0"];
    var rtn = "0";
    for(var n=0; n<9; n++){
        rtn += numbers[Math.floor(Math.random() * numbers.length)];
    }
    return rtn;
}

function MakeUpBuddies(int){
    for(var i=0; i<int; i++){
        var buddyObj = new Buddy("contact", uID(), MakeUpName(), "", "", MakeUpNumber(), "", utcDateNow(), "Testing", "");
        AddBuddy(buddyObj, false, false);
    }
    UpdateBuddyList();
}
    
function SelectBuddy(buddy) {
    var buddyObj = FindBuddyByIdentity(buddy);
    if(buddyObj == null) return;

    var presence = "";

    if(buddyObj.type == "extension"){
        presence += buddyObj.presence;
        if(presence == "Unknown") presence = lang.state_unknown;
        if(presence == "Not online") presence = lang.state_not_online;
        if(presence == "Ready") presence = lang.state_ready;
        if(presence == "On the phone") presence = lang.state_on_the_phone;
        if(presence == "Ringing") presence = lang.state_ringing;
        if(presence == "On hold") presence = lang.state_on_hold;
        if(presence == "Unavailable") presence = lang.state_unavailable;
        if(buddyObj.EnableSubscribe != true) presence = buddyObj.Desc;
    } else if(buddyObj.type == "contact"){
        presence += buddyObj.Desc;
    }
        $("#contact-" + buddyObj.identity + "-presence-main").html(presence);

        $("#contact-"+ buddyObj.identity +"-picture-main").css("background-image", $("#contact-"+ buddyObj.identity +"-picture-main").css("background-image"));
    
        for(var b = 0; b < Buddies.length; b++) {
            if(Buddies[b].IsSelected == true && Buddies[b].identity == buddy){
                // Nothing to do, you re-selected the same buddy;
                return;
            }
        }
    
        console.log("Selecting Buddy: "+ buddyObj.CallerIDName);
    
        selectedBuddy = buddyObj;
    
        // Can only display one thing on the Right
        $(".streamSelected").each(function () {
            $(this).prop('class', 'stream');
        });
        $("#stream-" + buddy).prop('class', 'streamSelected');
    
        // Update Lines List
        for(var l = 0; l < Lines.length; l++) {
            var classStr = "buddy";
            if(Lines[l].SipSession != null) classStr = (Lines[l].SipSession.isOnHold)? "buddyActiveCallHollding" : "buddyActiveCall";
            $("#line-" + Lines[l].LineNumber).prop('class', classStr);
            Lines[l].IsSelected = false;
        }
    
        ClearMissedBadge(buddy);
        // Update Buddy List
        for(var b = 0; b < Buddies.length; b++) {
            var classStr = (Buddies[b].identity == buddy)? "buddySelected" : "buddy";
            $("#contact-" + Buddies[b].identity).prop('class', classStr);
    
            $("#contact-"+ Buddies[b].identity +"-ChatHistory").empty();
    
            Buddies[b].IsSelected = (Buddies[b].identity == buddy);
        }
    
        // Change to Stream if in Narrow view
        UpdateUI();
        
        // Refresh Stream
        // console.log("Refreshing Stream for you(" + profileUserID + ") and : " + buddyObj.identity);
        RefreshStream(buddyObj);
    
        try{
            $("#contact-" + buddy).get(0).scrollIntoViewIfNeeded();
        } catch(e){}
    
        // Save Selected
        localDB.setItem("SelectedBuddy", buddy);
}

function CloseBuddy(buddy){
    // Lines and Buddies (Left)
    $(".buddySelected").each(function () {
        $(this).prop('class', 'buddy');
    });
    // Streams (Right)
    $(".streamSelected").each(function () {
        $(this).prop('class', 'stream');
    });

    console.log("Closing Buddy: "+ buddy);
    for(var b = 0; b < Buddies.length; b++){
        Buddies[b].IsSelected = false;
    }
    selectedBuddy = null;
    for(var l = 0; l < Lines.length; l++){
        Lines[l].IsSelected = false;
    }
    selectedLine = null;

    // Save Selected
    localDB.setItem("SelectedBuddy", null);

    // Change to Stream if in Narrow view
    UpdateUI();
}

function RemoveBuddy(buddy){
    // Check if you are on the phone etc
    Confirm(lang.confirm_remove_buddy, lang.remove_buddy, function(){
        for(var b = 0; b < Buddies.length; b++) {
            if(Buddies[b].identity == buddy) {
                RemoveBuddyMessageStream(Buddies[b]);
                UnsubscribeBuddy(Buddies[b]);
                if(Buddies[b].type == "xmpp") XmppRemoveBuddyFromRoster(Buddies[b]);
                Buddies.splice(b, 1);
                break;
            }
        }
        UpdateBuddyList();
    });
}

function FindBuddyByDid(did){
    // Used only in Inboud
    for(var b = 0; b < Buddies.length; b++){
        if(Buddies[b].ExtNo == did || Buddies[b].MobileNumber == did || Buddies[b].ContactNumber1 == did || Buddies[b].ContactNumber2 == did) {
            return Buddies[b];
        }
    }
    return null;
}
function FindBuddyByExtNo(ExtNo){
    for(var b = 0; b < Buddies.length; b++){
        if(Buddies[b].ExtNo == ExtNo) return Buddies[b];
    }
    return null;
}
function FindBuddyByNumber(number){
    // Number could be: +XXXXXXXXXX
    // Any special characters must be removed prior to adding
    for(var b = 0; b < Buddies.length; b++){
        if(Buddies[b].MobileNumber == number || Buddies[b].ContactNumber1 == number || Buddies[b].ContactNumber2 == number) {
            return Buddies[b];
        }
    }
    return null;
}
function FindBuddyByIdentity(identity){
    for(var b = 0; b < Buddies.length; b++){
        if(Buddies[b].identity == identity) return Buddies[b];
    }
    return null;
}
function FindBuddyByJid(jid){
    for(var b = 0; b < Buddies.length; b++){
        if(Buddies[b].jid == jid) return Buddies[b];
    }
    console.warn("Buddy not found on jid: "+ jid);
    return null;
}
function SearchStream(obj, buddy){
    var q = obj.value;

    var buddyObj = FindBuddyByIdentity(buddy);
    if(q == ""){
        console.log("Restore Stream");
        RefreshStream(buddyObj);
    }
    else{
        RefreshStream(buddyObj, q);
    }
}

/* Profile
============= */
function ShowMyProfile(){
    ShowContacts();

    $("#myContacts").hide();
    $("#actionArea").empty();

    var html = "<div style=\"text-align:right\"><button onclick=\"ShowContacts()\"><i class=\"fa fa-close\"></i></button></div>"

    html += "<div border=0 class=UiSideField>";

    // SIP Account
    if(EnableAccountSettings == true){
        html += "<div class=UiTextHeading onclick=\"ToggleHeading(this,'Configure_Extension_Html')\"><i class=\"fa fa-user-circle-o UiTextHeadingIcon\" style=\"background-color:#a93a3a\"></i> "+ lang.account +"</div>"
    }
    var AccountHtml =  "<div id=Configure_Extension_Html style=\"display:none\">";
    AccountHtml += "<div class=UiText>"+ lang.asterisk_server_address +":</div>";
    AccountHtml += "<div><input id=Configure_Account_wssServer class=UiInputText type=text placeholder='"+ lang.eg_asterisk_server_address +"' value='"+ getDbItem("wssServer", "") +"'></div>";

    AccountHtml += "<div class=UiText>"+ lang.websocket_port +":</div>";
    AccountHtml += "<div><input id=Configure_Account_WebSocketPort class=UiInputText type=text placeholder='"+ lang.eg_websocket_port +"' value='"+ getDbItem("WebSocketPort", "") +"'></div>";

    AccountHtml += "<div class=UiText>"+ lang.websocket_path +":</div>";
    AccountHtml += "<div><input id=Configure_Account_ServerPath class=UiInputText type=text placeholder='"+ lang.eg_websocket_path +"' value='"+ getDbItem("ServerPath", "") +"'></div>";

    AccountHtml += "<div class=UiText>"+ lang.internal_subscribe_extension +":</div>";
    AccountHtml += "<div><input id=Configure_Account_profileUser class=UiInputText type=text placeholder='"+ lang.eg_internal_subscribe_extension +"' value='"+ getDbItem("profileUser", "") +"'></div>";

    AccountHtml += "<div class=UiText>"+ lang.full_name +":</div>";
    AccountHtml += "<div><input id=Configure_Account_profileName class=UiInputText type=text placeholder='"+ lang.eg_full_name +"' value='"+ getDbItem("profileName", "") +"'></div>";

    AccountHtml += "<div class=UiText>"+ lang.sip_username +":</div>";
    AccountHtml += "<div><input id=Configure_Account_SipUsername class=UiInputText type=text placeholder='"+ lang.eg_sip_username +"' value='"+ getDbItem("SipUsername", "") +"'></div>";

    AccountHtml += "<div class=UiText>"+ lang.sip_password +":</div>";
    AccountHtml += "<div><input id=Configure_Account_SipPassword class=UiInputText type=password placeholder='"+ lang.eg_sip_password +"' value='"+ getDbItem("SipPassword", "") +"'></div>";

    AccountHtml += "<div class=UiText>"+ lang.chat_engine +":</div>";

    AccountHtml += "<ul style=\"list-style-type:none\">"
    AccountHtml += "<li><input type=radio name=chatEngine id=chat_type_sip "+ ((ChatEngine == "XMPP")? "" : "checked") +"><label for=chat_type_sip>SIP</label>"
    AccountHtml += "<li><input type=radio name=chatEngine id=chat_type_xmpp "+ ((ChatEngine == "XMPP")? "checked" : "") +"><label for=chat_type_xmpp>XMPP</label>"
    AccountHtml += "</ul>"

    AccountHtml += "<div id=RowChatEngine_xmpp style=\"display:"+ ((ChatEngine == "XMPP")? "unset" : "none") +"\">";

    AccountHtml += "<div class=UiText>XMPP "+ lang.xmpp_domain +":</div>";
    AccountHtml += "<div><input id=Configure_Account_xmpp_domain class=UiInputText type=text placeholder='"+ lang.eg_xmpp_domain +"' value='"+ getDbItem("XmppDomain", "") +"'></div>";

    AccountHtml += "<div class=UiText>XMPP "+ lang.server_address +":</div>";
    AccountHtml += "<div><input id=Configure_Account_xmpp_address class=UiInputText type=text placeholder='"+ lang.eg_xmpp_server_address +"' value='"+ getDbItem("XmppServer", "") +"'></div>";

    AccountHtml += "<div class=UiText>XMPP "+ lang.websocket_port +":</div>";
    AccountHtml += "<div><input id=Configure_Account_xmpp_port class=UiInputText type=text placeholder='"+ lang.eg_websocket_port +"' value='"+ getDbItem("XmppWebsocketPort", "") +"'></div>";

    AccountHtml += "<div class=UiText>XMPP "+ lang.websocket_path +":</div>";
    AccountHtml += "<div><input id=Configure_Account_xmpp_path class=UiInputText type=text placeholder='"+ lang.eg_websocket_path +"' value='"+ getDbItem("XmppWebsocketPath", "") +"'></div>";
    AccountHtml += "</div>";

    AccountHtml += "</div>";
    if(EnableAccountSettings == true) html += AccountHtml;

    // 2 Audio & Video
     html += "<div class=UiTextHeading onclick=\"ToggleHeading(this,'Audio_Html')\"><i class=\"fa fa fa-video-camera UiTextHeadingIcon\" style=\"background-color:#208e3c\"></i> "+ lang.audio_video +"</div>"

     var AudioVideoHtml = "<div id=Audio_Html style=\"display:none\">";

     AudioVideoHtml += "<div class=UiText>"+ lang.speaker +":</div>";
     AudioVideoHtml += "<div style=\"text-align:center\"><select id=playbackSrc style=\"width:100%\"></select></div>";
     AudioVideoHtml += "<div class=Settings_VolumeOutput_Container><div id=Settings_SpeakerOutput class=Settings_VolumeOutput></div></div>";
     AudioVideoHtml += "<div><button class=on_white id=preview_output_play><i class=\"fa fa-play\"></i></button></div>";

     AudioVideoHtml += "<div id=RingDeviceSection>";
     AudioVideoHtml += "<div class=UiText>"+ lang.ring_device +":</div>";
     AudioVideoHtml += "<div style=\"text-align:center\"><select id=ringDevice style=\"width:100%\"></select></div>";
     AudioVideoHtml += "<div class=Settings_VolumeOutput_Container><div id=Settings_RingerOutput class=Settings_VolumeOutput></div></div>";
     AudioVideoHtml += "<div><button class=on_white id=preview_ringer_play><i class=\"fa fa-play\"></i></button></div>";
     AudioVideoHtml += "</div>";

     AudioVideoHtml += "<div class=UiText>"+ lang.microphone +":</div>";
     AudioVideoHtml += "<div style=\"text-align:center\"><select id=microphoneSrc style=\"width:100%\"></select></div>";
     AudioVideoHtml += "<div class=Settings_VolumeOutput_Container><div id=Settings_MicrophoneOutput class=Settings_VolumeOutput></div></div>";
     AudioVideoHtml += "<div><input type=checkbox id=Settings_AutoGainControl><label for=Settings_AutoGainControl> "+ lang.auto_gain_control +"<label></div>";
     AudioVideoHtml += "<div><input type=checkbox id=Settings_EchoCancellation><label for=Settings_EchoCancellation> "+ lang.echo_cancellation +"<label></div>";
     AudioVideoHtml += "<div><input type=checkbox id=Settings_NoiseSuppression><label for=Settings_NoiseSuppression> "+ lang.noise_suppression +"<label></div>";

     AudioVideoHtml += "<div class=UiText>"+ lang.preview +":</div>";
     AudioVideoHtml += "<div style=\"text-align:center; margin-top:10px\"><video id=local-video-preview class=previewVideo muted playsinline></video></div>";
 
     AudioVideoHtml += "</div>";
 
     html += AudioVideoHtml;

     // Appearance
     if(EnableAppearanceSettings == true) {
        html += "<div class=UiTextHeading onclick=\"ToggleHeading(this,'Appearance_Html')\"><i class=\"fa fa-pencil UiTextHeadingIcon\" style=\"background-color:#416493\"></i> "+ lang.appearance +"</div>"
    }

    var AppearanceHtml = "<div id=Appearance_Html style=\"display:none\">"; 
    AppearanceHtml += "<div id=ImageCanvas style=\"width:150px; height:150px\"></div>";
    AppearanceHtml += "<div style=\"margin-top:50px;\"><input id=fileUploader type=file></div>";
    AppearanceHtml += "<div style=\"margin-top:10px\"></div>";

    // SIP vCard
    var profileVcard = getDbItem("profileVcard", null);
    if(profileVcard != null) profileVcard = JSON.parse(profileVcard);

    AppearanceHtml += "<div class=UiText>"+ lang.title_description +":</div>";
    AppearanceHtml += "<div><input id=Configure_Profile_TitleDesc class=UiInputText type=text placeholder='"+ lang.eg_general_manager +"' value='"+ ((profileVcard != null)? profileVcard.TitleDesc : "") +"'></div>";
    AppearanceHtml += "<div class=UiText>"+ lang.mobile_number +":</div>";
    AppearanceHtml += "<div><input id=Configure_Profile_Mobile class=UiInputText type=text placeholder='"+ lang.eg_mobile_number +"' value='"+ ((profileVcard != null)? profileVcard.Mobile : "") +"'></div>";
    AppearanceHtml += "<div class=UiText>"+ lang.email +":</div>";
    AppearanceHtml += "<div><input id=Configure_Profile_Email class=UiInputText type=text placeholder='"+ lang.email +"' value='"+ ((profileVcard != null)? profileVcard.Email : "") +"'></div>";
    AppearanceHtml += "<div class=UiText>"+ lang.contact_number_1 +":</div>";

    AppearanceHtml += "</div>";

    if(EnableAppearanceSettings == true) html += AppearanceHtml;

    // Notifications
    if(EnableNotificationSettings == true) {
        html += "<div class=UiTextHeading onclick=\"ToggleHeading(this,'Notifications_Html')\"><i class=\"fa fa-bell UiTextHeadingIcon\" style=\"background-color:#ab8e04\"></i> "+ lang.notifications +"</div>"
    }

    var NotificationsHtml = "<div id=Notifications_Html style=\"display:none\">";
    NotificationsHtml += "<div class=UiText>"+ lang.notifications +":</div>";
    NotificationsHtml += "<div><input type=checkbox id=Settings_Notifications><label for=Settings_Notifications> "+ lang.enable_onscreen_notifications +"<label></div>";
    NotificationsHtml += "</div>";

    if(EnableNotificationSettings == true) html += NotificationsHtml;

    html += "</div>";

    html += "<div class=UiWindowButtonBar id=ButtonBar></div>";

    $("#actionArea").html(html);

    // Buttons
    var buttons = [];
    buttons.push({
        text: lang.save,
        action: function(){

            if(EnableAccountSettings){
                if($("#Configure_Account_wssServer").val() == "") {
                    console.warn("Validation Failed");
                    return;
                } 
                if($("#Configure_Account_WebSocketPort").val() == "") {
                    console.warn("Validation Failed");
                    return;
                } 
                if($("#Configure_Account_profileUser").val() == "") {
                    console.warn("Validation Failed");
                    return;
                } 
                if($("#Configure_Account_profileName").val() == "") {
                    console.warn("Validation Failed");
                    return;
                } 
                if($("#Configure_Account_SipUsername").val() == "") {
                    console.warn("Validation Failed");
                    return;
                } 
                if($("#Configure_Account_SipPassword").val() == "") {
                    console.warn("Validation Failed");
                    return;
                }
            }
            
            // The profileUserID identifies users
            if(localDB.getItem("profileUserID") == null) localDB.setItem("profileUserID", uID()); // For first time only
    
            // 1 Account
            if(EnableAccountSettings){
                localDB.setItem("ServerPath", $("#Configure_Account_ServerPath").val());
                localDB.setItem("profileUser", $("#Configure_Account_profileUser").val());
                localDB.setItem("profileName", $("#Configure_Account_profileName").val());
                localDB.setItem("SipUsername", $("#Configure_Account_SipUsername").val());
                localDB.setItem("SipPassword", $("#Configure_Account_SipPassword").val());
            }
    
            // 2 Audio & Video
            localDB.setItem("AudioOutputId", $("#playbackSrc").val());
            localDB.setItem("AudioSrcId", $("#microphoneSrc").val());
            localDB.setItem("AutoGainControl", ($("#Settings_AutoGainControl").is(':checked'))? "1" : "0");
            localDB.setItem("EchoCancellation", ($("#Settings_EchoCancellation").is(':checked'))? "1" : "0");
            localDB.setItem("NoiseSuppression", ($("#Settings_NoiseSuppression").is(':checked'))? "1" : "0");
            localDB.setItem("RingOutputId", $("#ringDevice").val());
    
            // 3 Appearance
            if(EnableAppearanceSettings){
                var vCard = { 
                    "TitleDesc": $("#Configure_Profile_TitleDesc").val(),
                    "Mobile": $("#Configure_Profile_Mobile").val(),
                    "Email": $("#Configure_Profile_Email").val()
                }
                localDB.setItem("profileVcard", JSON.stringify(vCard));

                var options =  { 
                    type: 'base64', 
                    size: 'viewport', 
                    format: 'png', 
                    quality: 1, 
                    circle: false 
                }
                $("#Appearance_Html").show(); // Bug, only works if visible
                $("#ImageCanvas").croppie('result', options).then(function(base64) {
                    localDB.setItem("profilePicture", base64);
                    $("#Appearance_Html").hide();

                    // Notify Changes
                    Alert(lang.alert_settings, lang.reload_required, function(){
                        window.location.reload();
                    });
        
                });
            }
            else {
                // Notify Changes
                Alert(lang.alert_settings, lang.reload_required, function(){
                    window.location.reload();
                });
            }

            // 4 Notifications
            if(EnableNotificationSettings){
                localDB.setItem("Notifications", ($("#Settings_Notifications").is(":checked"))? "1" : "0");
            }

        }
    });

    buttons.push({
        text: lang.cancel,
        action: function(){
            ShowContacts();
        }
    });
    $.each(buttons, function(i,obj){
        var button = $('<button>'+ obj.text +'</button>').click(obj.action);
        $("#ButtonBar").append(button);
    });

    // Show
    $("#actionArea").show();

    // DoOnload
    window.setTimeout(function(){
        // Account
        if(EnableAccountSettings){
            $("#chat_type_sip").change(function(){
                if($("#chat_type_sip").is(':checked')){
                    $("#RowChatEngine_xmpp").hide();
                }
            });
        }

        // Audio Video
        var selectAudioScr = $("#playbackSrc");

        var playButton = $("#preview_output_play");
    
        var playRingButton = $("#preview_ringer_play");
    
        // Microphone
        var selectMicScr = $("#microphoneSrc");
        $("#Settings_AutoGainControl").prop("checked", AutoGainControl);
        $("#Settings_EchoCancellation").prop("checked", EchoCancellation);
        $("#Settings_NoiseSuppression").prop("checked", NoiseSuppression);

        // Ring Tone
        var selectRingTone = $("#ringTone");

        // Ring Device
        var selectRingDevice = $("#ringDevice");

        // Handle Audio Source changes (Microphone)
        selectMicScr.change(function(){
            console.log("Call to change Microphone ("+ this.value +")");
    
            try{
                var tracks = window.SettingsMicrophoneStream.getTracks();
                tracks.forEach(function(track) {
                    track.stop();
                });
                window.SettingsMicrophoneStream = null;
            }
            catch(e){}
    
            try{
                soundMeter = window.SettingsMicrophoneSoundMeter;
                soundMeter.stop();
                window.SettingsMicrophoneSoundMeter = null;
            }
            catch(e){}
    
            // Get Microphone
            var constraints = { 
                audio: {
                    deviceId: { exact: this.value }
                },
            }
            var localMicrophoneStream = new MediaStream();
            navigator.mediaDevices.getUserMedia(constraints).then(function(mediaStream){
                var audioTrack = mediaStream.getAudioTracks()[0];
                if(audioTrack != null){
                    // Display Micrphone Levels
                    localMicrophoneStream.addTrack(audioTrack);
                    window.SettingsMicrophoneStream = localMicrophoneStream;
                    window.SettingsMicrophoneSoundMeter = MeterSettingsOutput(localMicrophoneStream, "Settings_MicrophoneOutput", "width", 50);
                }
            }).catch(function(e){
                console.log("Failed to getUserMedia", e);
            });
        });
    
        // Handle output change (speaker)
        selectAudioScr.change(function(){
            console.log("Call to change Speaker ("+ this.value +")");
    
            var audioObj = window.SettingsOutputAudio;
            if(audioObj != null) {
                if (typeof audioObj.sinkId !== 'undefined') {
                    audioObj.setSinkId(this.value).then(function() {
                        console.log("sinkId applied to audioObj:", this.value);
                    }).catch(function(e){
                        console.warn("Failed not apply setSinkId.", e);
                    });
                }
            }
        });
    
        // play button press
        playButton.click(function(){
    
            try{
                window.SettingsOutputAudio.pause();
            } 
            catch(e){}
            window.SettingsOutputAudio = null;
    
            try{
                var tracks = window.SettingsOutputStream.getTracks();
                tracks.forEach(function(track) {
                    track.stop();
                });
            }
            catch(e){}
            window.SettingsOutputStream = null;
    
            try{
                var soundMeter = window.SettingsOutputStreamMeter;
                soundMeter.stop();
            }
            catch(e){}
            window.SettingsOutputStreamMeter = null;
    
            // Load Sample
            console.log("Audio:", audioBlobs.speech_orig.url);
            var audioObj = new Audio(audioBlobs.speech_orig.blob);
            audioObj.preload = "auto";
            audioObj.onplay = function(){
                var outputStream = new MediaStream();
                if (typeof audioObj.captureStream !== 'undefined') {
                    outputStream = audioObj.captureStream();
                } 
                else if (typeof audioObj.mozCaptureStream !== 'undefined') {
                    return;
                    // BUG: mozCaptureStream() in Firefox does not work the same way as captureStream()
                    // the actual sound does not play out to the speakers... its as if the mozCaptureStream
                    // removes the stream from the <audio> object.
                    outputStream = audioObj.mozCaptureStream();
                }
                else if (typeof audioObj.webkitCaptureStream !== 'undefined') {
                    outputStream = audioObj.webkitCaptureStream();
                }
                else {
                    console.warn("Cannot display Audio Levels")
                    return;
                }
                // Monitor Output
                window.SettingsOutputStream = outputStream;
                window.SettingsOutputStreamMeter = MeterSettingsOutput(outputStream, "Settings_SpeakerOutput", "width", 50);
            }
            audioObj.oncanplaythrough = function(e) {
                if (typeof audioObj.sinkId !== 'undefined') {
                    audioObj.setSinkId(selectAudioScr.val()).then(function() {
                        console.log("Set sinkId to:", selectAudioScr.val());
                    }).catch(function(e){
                        console.warn("Failed not apply setSinkId.", e);
                    });
                }
                // Play
                audioObj.play().then(function(){
                    // Audio Is Playing
                }).catch(function(e){
                    console.warn("Unable to play audio file", e);
                });
                console.log("Playing sample audio file... ");
            }
    
            window.SettingsOutputAudio = audioObj;
        });
    
        playRingButton.click(function(){
    
            try{
                window.SettingsRingerAudio.pause();
            } 
            catch(e){}
            window.SettingsRingerAudio = null;
    
            try{
                var tracks = window.SettingsRingerStream.getTracks();
                tracks.forEach(function(track) {
                    track.stop();
                });
            }
            catch(e){}
            window.SettingsRingerStream = null;
    
            try{
                var soundMeter = window.SettingsRingerStreamMeter;
                soundMeter.stop();
            }
            catch(e){}
            window.SettingsRingerStreamMeter = null;
    
            // Load Sample
            console.log("Audio:", audioBlobs.Ringtone.url);
            var audioObj = new Audio(audioBlobs.Ringtone.blob);
            audioObj.preload = "auto";
            audioObj.onplay = function(){
                var outputStream = new MediaStream();
                if (typeof audioObj.captureStream !== 'undefined') {
                    outputStream = audioObj.captureStream();
                } 
                else if (typeof audioObj.mozCaptureStream !== 'undefined') {
                    return;
                    // BUG: mozCaptureStream() in Firefox does not work the same way as captureStream()
                    // the actual sound does not play out to the speakers... its as if the mozCaptureStream
                    // removes the stream from the <audio> object.
                    outputStream = audioObj.mozCaptureStream();
                }
                else if (typeof audioObj.webkitCaptureStream !== 'undefined') {
                    outputStream = audioObj.webkitCaptureStream();
                }
                else {
                    console.warn("Cannot display Audio Levels")
                    return;
                }
                // Monitor Output
                window.SettingsRingerStream = outputStream;
                window.SettingsRingerStreamMeter = MeterSettingsOutput(outputStream, "Settings_RingerOutput", "width", 50);
            }
            audioObj.oncanplaythrough = function(e) {
                if (typeof audioObj.sinkId !== 'undefined') {
                    audioObj.setSinkId(selectRingDevice.val()).then(function() {
                        console.log("Set sinkId to:", selectRingDevice.val());
                    }).catch(function(e){
                        console.warn("Failed not apply setSinkId.", e);
                    });
                }
                // Play
                audioObj.play().then(function(){
                    // Audio Is Playing
                }).catch(function(e){
                    console.warn("Unable to play audio file", e);
                });
                console.log("Playing sample audio file... ");
            }
    
            window.SettingsRingerAudio = audioObj;
        });

        if(navigator.mediaDevices){
            navigator.mediaDevices.enumerateDevices().then(function(deviceInfos){
                var savedVideoDevice = getVideoSrcID();
    
                var savedAudioDevice = getAudioSrcID();
                var audioDeviceFound = false;
    
                var MicrophoneFound = false;
                var SpeakerFound = false;
    
                for (var i = 0; i < deviceInfos.length; ++i) {
                    console.log("Found Device ("+ deviceInfos[i].kind +"): ", deviceInfos[i].label);
    
                   // Check Devices
                    if (deviceInfos[i].kind === "audioinput") {
                        MicrophoneFound = true;
                        if(savedAudioDevice != "default" && deviceInfos[i].deviceId == savedAudioDevice) {
                            audioDeviceFound = true;
                        }                   
                    }
                    else if (deviceInfos[i].kind === "audiooutput") {
                        SpeakerFound = true;
                    }
                }

                var contraints = {
                    audio: MicrophoneFound
                }
    
                if(MicrophoneFound){
                    contraints.audio = { deviceId: "default" }
                    if(audioDeviceFound) contraints.audio.deviceId = { exact: savedAudioDevice }
                }

            }).catch(function(e){
                console.error("Error getting Media Devices", e);
            });
        }
        else {
            Alert(lang.alert_media_devices, lang.error);
        }

        // Appearance
        if(EnableAppearanceSettings){
            cropper = $("#ImageCanvas").croppie({
                viewport: { width: 150, height: 150, type: 'circle' }
            });

            // Preview Existing Image
            $("#ImageCanvas").croppie('bind', { 
                url: getPicture("profilePicture") 
            });

            // Wireup File Change
            $("#fileUploader").change(function () {
                var filesArray = $(this).prop('files');

                if (filesArray.length == 1) {
                    var uploadId = Math.floor(Math.random() * 1000000000);
                    var fileObj = filesArray[0];
                    var fileName = fileObj.name;
                    var fileSize = fileObj.size;
            
                    if (fileSize <= 52428800) {
                        console.log("Adding (" + uploadId + "): " + fileName + " of size: " + fileSize + "bytes");
            
                        var reader = new FileReader();
                        reader.Name = fileName;
                        reader.UploadId = uploadId;
                        reader.Size = fileSize;
                        reader.onload = function (event) {
                            $("#ImageCanvas").croppie('bind', {
                                url: event.target.result
                            });
                        }
            
                        // Use onload for this
                        reader.readAsDataURL(fileObj);
                    }
                    else {
                        Alert(lang.alert_file_size, lang.error);
                    }
                }
                else {
                    Alert(lang.alert_single_file, lang.error);
                }
            });
        }

        // Notifications
        if(EnableNotificationSettings){
            var NotificationsCheck = $("#Settings_Notifications");
            NotificationsCheck.prop("checked", NotificationsActive);
            NotificationsCheck.change(function(){
                if(this.checked){
                    if(Notification.permission != "granted"){
                        if(checkNotificationPromise()){
                            Notification.requestPermission().then(function(p){
                                console.log(p);
                                HandleNotifyPermission(p);
                            });
                        }
                        else {
                            Notification.requestPermission(function(p){
                                console.log(p);
                                HandleNotifyPermission(p)
                            });
                        }
                    }
                }
            });
        }


    }, 0);
}

function RefreshRegistration(){
    Unregister();
    console.log("Unregister complete...");
    window.setTimeout(function(){
        console.log("Starting registration...");
        Register();
    }, 1000);
}

function ToggleHeading(obj, div){
    $("#"+ div).toggle();
}

function ToggleAutoAnswer(){
    if(AutoAnswerPolicy == "disabled"){
        AutoAnswerEnabled = false;
        console.warn("Policy AutoAnswer: Disabled");
        return;
    }
    AutoAnswerEnabled = (AutoAnswerEnabled == true)? false : true;
    if(AutoAnswerPolicy == "enabled") AutoAnswerEnabled = true;
    localDB.setItem("AutoAnswerEnabled", (AutoAnswerEnabled == true)? "1" : "0");
    console.log("AutoAnswer:", AutoAnswerEnabled);
}

function ToggleDoNoDisturb(){
    if(DoNotDisturbPolicy == "disabled"){
        DoNotDisturbEnabled = false;
        console.warn("Policy DoNotDisturb: Disabled");
        return;
    }
    DoNotDisturbEnabled = (DoNotDisturbEnabled == true)? false : true;
    if(DoNotDisturbPolicy == "enabled") DoNotDisturbEnabled = true;
    localDB.setItem("DoNotDisturbEnabled", (DoNotDisturbEnabled == true)? "1" : "0");
    $("#dereglink").attr("class", (DoNotDisturbEnabled == true)? "dotDoNotDisturb" : "dotOnline" );
    console.log("DoNotDisturb", DoNotDisturbEnabled);
}

function ToggleCallWaiting(){
    if(CallWaitingPolicy == "disabled"){
        CallWaitingEnabled = false;
        console.warn("Policy CallWaiting: Disabled");
        return;
    }
    CallWaitingEnabled = (CallWaitingEnabled == true)? false : true;
    if(CallWaitingPolicy == "enabled") CallWaitingPolicy = true;
    localDB.setItem("CallWaitingEnabled", (CallWaitingEnabled == true)? "1" : "0");
    console.log("CallWaiting", CallWaitingEnabled);
}

/* Device Settings
===================== */
function ChangeSettings(lineNum, obj){
    // Check if you are in a call
    var lineObj = FindLineByNumber(lineNum);
    if(lineObj == null || lineObj.SipSession == null) {
        console.warn("SIP Session is NULL.");
        return;
    }
    var session = lineObj.SipSession;

    // Load Devices
    if(!navigator.mediaDevices) {
        console.warn("navigator.mediaDevices not possible.");
        return;
    }

    var items = [];

    // Microphones
    items.push({value: "", icon : null, text: lang.microphone, isHeader: true });
    for (var i = 0; i < AudioinputDevices.length; ++i) {
        var deviceInfo = AudioinputDevices[i];
        var devideId = deviceInfo.deviceId;
        var DisplayName = (deviceInfo.label)? deviceInfo.label : "Microphone";
        if(DisplayName.indexOf("(") > 0) DisplayName = DisplayName.substring(0,DisplayName.indexOf("("));
        var disabled = (session.data.AudioSourceDevice == devideId);

        items.push({value: "input-"+ devideId, icon : "fa fa-microphone", text: DisplayName, isDisabled : disabled });
    }
    // Speakers
    if(HasSpeakerDevice){
        items.push({value: "", icon : null, text: "-" });
        items.push({value: "", icon : null, text: lang.speaker, isHeader: true });
        for (var i = 0; i < SpeakerDevices.length; ++i) {
            var deviceInfo = SpeakerDevices[i];
            var devideId = deviceInfo.deviceId;
            var DisplayName = (deviceInfo.label)? deviceInfo.label : "Speaker";
            if(DisplayName.indexOf("(") > 0) DisplayName = DisplayName.substring(0,DisplayName.indexOf("("));
            var disabled = (session.data.AudioOutputDevice == devideId);

            items.push({value: "output-"+ devideId, icon : "fa fa-volume-up", text: DisplayName, isDisabled : disabled });
        }
    }

    var menu = {
        selectEvent : function( event, ui ) {
            var id = ui.item.attr("value");
            if(id != null) {

                // Microphone Device Change
                if(id.indexOf("input-") > -1){
                    var newid = id.replace("input-", "");

                    console.log("Call to change Microphone: ", newid);

                    HidePopup();
            
                    // Stop Monitoring
                    if(lineObj.LocalSoundMeter) lineObj.LocalSoundMeter.stop();
            
                    // Save Setting
                    session.data.AudioSourceDevice = newid;
            
                    var constraints = {
                        audio: {
                            deviceId: (newid != "default")? { exact: newid } : "default"
                        },
                    }
                    navigator.mediaDevices.getUserMedia(constraints).then(function(newStream){
                        // Assume possibility from dropdown
                        var newMediaTrack = newStream.getAudioTracks()[0];
                        var pc = session.sessionDescriptionHandler.peerConnection;
                        pc.getSenders().forEach(function (RTCRtpSender) {
                            if(RTCRtpSender.track && RTCRtpSender.track.kind == "audio") {
                                console.log("Switching Audio Track : "+ RTCRtpSender.track.label + " to "+ newMediaTrack.label);
                                RTCRtpSender.track.stop(); // Must stop, or this mic will stay in use
                            }
                        });
                    }).catch(function(e){
                        console.error("Error on getUserMedia");
                    });
                }

                // Speaker
                if(id.indexOf("output-") > -1){
                    var newid = id.replace("output-", "");

                    console.log("Call to change Speaker: ", newid);

                    HidePopup();
            
                    // Save Setting
                    session.data.AudioOutputDevice = newid;
            
                    // Also change the sinkId
                    // ======================
                    var sinkId = newid;
                    console.log("Attempting to set Audio Output SinkID for line "+ lineNum +" [" + sinkId + "]");
            
                    // Remote Audio
                    var element = $("#line-"+ lineNum +"-remoteAudio").get(0);
                    if(element) {
                        if (typeof element.sinkId !== 'undefined') {
                            element.setSinkId(sinkId).then(function(){
                                console.log("sinkId applied: "+ sinkId);
                            }).catch(function(e){
                                console.warn("Error using setSinkId: ", e);
                            });
                        } else {
                            console.warn("setSinkId() is not possible using this browser.")
                        }
                    }
                }
            }
        }
    }
    PopupMenu(obj, menu);
}

/* Call Stats
================ */
function ShowCallStats(lineNum, obj){
    console.log("Show Call Stats");
    $("#line-"+ lineNum +"-AdioStats").show(300);
}
function HideCallStats(lineNum, obj){
    console.log("Hide Call Stats");
    $("#line-"+ lineNum +"-AdioStats").hide(300);
}

/* UI Elements
================= */
function OpenWindow(html, title, height, width, hideCloseButton, allowResize, button1_Text, button1_onClick, button2_Text, button2_onClick, DoOnLoad, OnClose) {
    console.log("Open Window: " + title);

    // Close any windows that may already be open
    if(windowObj != null){
        windowObj.dialog("close");
        windowObj = null;
    }

    // Create Window
    windowObj = $('<div></div>').html(html).dialog({
        autoOpen: false,
        title: title,
        modal: true,
        width: width,
        height: height,
        resizable: allowResize,
        classes: { "ui-dialog-content": "scroller"},
        close: function(event, ui) {
            $(this).dialog("destroy");
            windowObj = null;
        }
    });
    var buttons = [];
    if(button1_Text && button1_onClick){
        buttons.push({
            text: button1_Text,
            click: function(){
                console.log("Button 1 ("+ button1_Text +") Clicked");
                button1_onClick();
            }
        });
    }
    if(button2_Text && button2_onClick){
        buttons.push({
            text: button2_Text,
            click: function(){
                console.log("Button 2 ("+ button2_Text +") Clicked");
                button2_onClick();
            }
        });
    }
    if(buttons.length >= 1) windowObj.dialog( "option", "buttons", buttons);

    if(OnClose) windowObj.on("dialogbeforeclose", function(event, ui) {
        return OnClose(this);
    });
    if(DoOnLoad) windowObj.on("dialogopen", function(event, ui) {
        DoOnLoad();
    });

    // Open the Window
    windowObj.dialog("open");

    if (hideCloseButton) windowObj.dialog({ dialogClass: 'no-close' });

    var windowWidth = $(window).outerWidth();
    var windowHeight = $(window).outerHeight();
    var offsetTextHeight = windowObj.parent().outerHeight();

    if(windowWidth <= width || windowHeight <= offsetTextHeight) {
        windowObj.parent().css('top', '0px'); // option
        windowObj.parent().css('left', '0px');
        windowObj.dialog("option", "height", windowHeight); // option
        windowObj.dialog("option", "width", windowWidth);
    } 
    else {
        windowObj.parent().css('left', windowWidth/2 - width/2 + 'px');
        windowObj.parent().css('top', windowHeight/2 - offsetTextHeight/2 + 'px');
    }

    // Doubl Click to maximise
    $(".ui-dialog-titlebar").dblclick(function(){
        windowObj.parent().css('top', '0px'); // option
        windowObj.parent().css('left', '0px');
        windowObj.dialog("option", "height", windowHeight); // option
        windowObj.dialog("option", "width", windowWidth);
    });
}
function CloseWindow(all) {
    console.log("Call to close any open window");

    if(windowObj != null){
        windowObj.dialog("close");
        windowObj = null;
    }
    if(all == true){
        if (confirmObj != null) {
            confirmObj.dialog("close");
            confirmObj = null;
        }
        if (promptObj != null) {
            promptObj.dialog("close");
            promptObj = null;
        }
        if (alertObj != null) {
            alertObj.dialog("close");
            alertObj = null;
        }
    }
}
function WindowProgressOn() {
    //
}
function WindowProgressOff() {
    //
}

function PopupMenu(obj, menu){
    console.log("Show Popup Menu");

    // Close any menu that may already be open
    if(menuObj != null){
        menuObj.menu("destroy");
        menuObj.empty();
        menuObj.remove();
        menuObj = null;
    }

    var x = $(obj).offset().left - $(document).scrollLeft();
    var y = $(obj).offset().top - $(document).scrollTop();
    var w = $(obj).outerWidth()
    var h = $(obj).outerHeight()

    menuObj = $("<ul></ul>");
    if(menu && menu.items){
        $.each(menu.items, function(i, item){
            var header = (item.isHeader == true)? " class=\"ui-widget-header\"" : "";
            var disabled = (item.isDisabled == true)? " class=\"ui-state-disabled\"" : "";
            if(item.icon != null){
                menuObj.append("<li value=\""+ item.value +"\" "+ header +" "+ disabled +"><div><span class=\""+ item.icon +" ui-icon\"></span>"+ item.text +"</div></li>");
            }
            else {
                menuObj.append("<li value=\""+ item.value +"\" "+ header +" "+ disabled +"><div>"+ item.text +"</div></li>");
            }
        });
    }
    menuObj.append("<li><div>-</div></li>");
    menuObj.append("<li><div style=\"text-align:center; padding-right: 2em\">"+ lang.cancel +"</div></li>");

    // Attach UL to body
    menuObj.appendTo(document.body);

    // Create Menu
    menuObj.menu({});

    // Event wireup
    if(menu && menu.selectEvent){
        menuObj.on("menuselect", menu.selectEvent);
    }
    if(menu && menu.createEvent){
        menuObj.on("menucreate", menu.createEvent);
    }
    menuObj.on('blur',function(){
        HidePopup();
    });
    if(menu && menu.autoFocus == true) menuObj.focus();

    // Final Positions
    var menuWidth = menuObj.outerWidth()
    var left = x-((menuWidth/2)-(w/2));
    if(left + menuWidth + 10 > window.innerWidth){
        left = window.innerWidth - menuWidth - 10;
    }
    if(left < 0) left = 0;
    menuObj.css("left",  left + "px");

    var menuHeight = menuObj.outerHeight()
    var top = y+h;
    if(top + menuHeight + 10 > window.innerHeight){
        top = window.innerHeight - menuHeight - 10;
    }
    if(top < 0) top = 0;
    menuObj.css("top", top + "px");

}

function HidePopup(timeout){
    if(timeout){
        window.setTimeout(function(){
            if(menuObj != null){
                menuObj.menu("destroy");
                try{
                    menuObj.empty();
                }
                catch(e){}
                try{
                    menuObj.remove();
                }
                catch(e){}
                menuObj = null;
            }
        }, timeout);
    } else {
        if(menuObj != null){
            menuObj.menu("destroy");
            try{
                menuObj.empty();
            }
            catch(e){}
            try{
                menuObj.remove();
            }
            catch(e){}
            menuObj = null;
        }
    }
}

/* Device Detection 
====================== */
function DetectDevices(){
    navigator.mediaDevices.enumerateDevices().then(function(deviceInfos){
        /* Lables will be attached to devices after permission has been accepted during
        getUserMedia on Start-up/Setup
        */
        HasAudioDevice = false;
        HasSpeakerDevice = false; // Safari and Firefox don't have these
        AudioinputDevices = [];
        SpeakerDevices = [];
        for (var i = 0; i < deviceInfos.length; ++i) {
            if (deviceInfos[i].kind === "audioinput") {
                HasAudioDevice = true;
                AudioinputDevices.push(deviceInfos[i]);
            } 
            else if (deviceInfos[i].kind === "audiooutput") {
                HasSpeakerDevice = true;
                SpeakerDevices.push(deviceInfos[i]);
            }
        }
    }).catch(function(e){
        console.error("Error enumerating devices", e);
    });
}
DetectDevices();
window.setInterval(function(){
    DetectDevices();
}, 10000);







        











