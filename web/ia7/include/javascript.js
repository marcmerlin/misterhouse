
var ia7_ver = "v1.6.300";
var entity_store = {}; //global storage of entities
var json_store = {};
var updateSocket;
var updateSocketN; //Second socket for notifications
var display_mode;
if (display_mode == undefined) display_mode = "simple";
var notifications;
var speech_sound;
var speech_banner;
var audio_init;
var audioElement = document.getElementById('sound_element');
var authorized = "false";
var developer = false;
var show_tooltips = true;
var rrd_refresh_loop;
var stats_loop;
var stat_refresh = 60;
var fp_popover_close = true ;
var dev_changes = 0;

var ctx; //audio context
var buf; //audio buffer

//Takes the current location and parses the achor element into a hash
function URLToHash() {
	if (location.hash === undefined) return;
	var URLHash = {};
	var url = location.hash.replace(/^\#/, ''); //Replace Hash Entity
	var pairs = url.split('&');
	for (var i = 0; i < pairs.length; i++) {
		var pair = pairs[i].split('=');
		URLHash[decodeURIComponent(pair[0])] = decodeURIComponent(pair[1]);
	}
	return URLHash;
}

//Takes a hash and turns it back into a url
function HashtoURL(URLHash) {
	var pairs = [];
	for (var key in URLHash){
		if (URLHash.hasOwnProperty(key)){
			pairs.push(encodeURIComponent(key) + '=' + encodeURIComponent(URLHash[key]));
		}
	}
	return location.path + "#" + pairs.join('&');
}

//Takes a hash and spits out the JSON request argument string
function HashtoJSONArgs(URLHash) {
	var pairs = [];
	var path = "";
	if (URLHash.path !== undefined) {
		path = URLHash.path;
	}
	delete URLHash.path;
	for (var key in URLHash){
		if (key.indexOf("_") === 0){
			//Do not include private arguments
			continue;
		}
		if (URLHash.hasOwnProperty(key)){
			pairs.push(encodeURIComponent(key) + '=' + encodeURIComponent(URLHash[key]));
		}
	}
	return path + "?" + pairs.join('&');
}

//Gets any arguments in the URL that aren't part of IA7
function HashPathArgs(URLHash) {
	var loc = location.href.split('?');
	if (loc[1] === undefined) {
		return;
	}
	var pairs = loc[1].split('&');
	var rpairs = [];
	for (var i = 0; i < pairs.length; i++) {
		var pair = pairs[i].split('=');
		if (pair[0].indexOf("_") === 0){
			//Do not include private arguments
			continue;
		}
		rpairs.push(pair[0]+"="+pair[1]);
	}
	return  rpairs.join('&');
}

//Stores the JSON data in the proper location based on the path requested
function JSONStore (json){
	var newJSON = {};
	for (var i = json.meta.path.length-1; i >= 0; i--){
		var path = json.meta.path[i];
		if ($.isEmptyObject(newJSON)){
			newJSON[path] = json.data;
		}
		else {
			var tempJSON = {};
			tempJSON[path] = newJSON;
			newJSON = tempJSON;
		}
	}
	newJSON.meta = json.meta;
	//Merge the new JSON data structure into our stored structure
	$.extend( true, json_store, newJSON );
}

//Get the JSON data for the defined path
function getJSONDataByPath (path){
	if (json_store === undefined){
		return undefined;
	}
	var returnJSON = json_store;
	path = path.replace(/^\/|\/$/g, "");
	var pathArr = path.split('/');
	for (var i = 0; i < pathArr.length; i++){
		if (returnJSON[pathArr[i]] !== undefined){
			returnJSON = returnJSON[pathArr[i]];
		}
		else {
			// We don't have this data
			return undefined;
		}
	}
	return returnJSON;
}

//Called anytime the page changes
function changePage (){
	var URLHash = URLToHash();
	if (URLHash.path === undefined) {
		// This must be a call to root.  To speed things up, only request
		// collections
		URLHash.path = "collections";
	}
	if (getJSONDataByPath("ia7_config") === undefined){
		// Load all the specific preferences
		$.ajax({
			type: "GET",
			url: "/json/ia7_config",
			dataType: "json",
			success: function( json ) {
				JSONStore(json);
				changePage();
			}
		});
	} else {
        if ((json_store.ia7_config.prefs.static_tagline !== undefined) &&  json_store.ia7_config.prefs.static_tagline == "yes") clearTimeout(stats_loop);
        if (json_store.ia7_config.prefs.stat_refresh !== undefined) stat_refresh = json_store.ia7_config.prefs.stat_refresh;
		if (json_store.ia7_config.prefs.header_button == "no") {
		    $("#mhstatus").hide();
		} else {
		    $("#mhstatus").show();
		}
		
		if (json_store.ia7_config.prefs.audio_controls !== undefined && json_store.ia7_config.prefs.audio_controls == "yes") {
  			$("#sound_element").attr("controls", "controls");  //Show audio Controls
  		}
		if (json_store.ia7_config.prefs.substate_percentages === undefined) json_store.ia7_config.prefs.substate_percentages = 20;
//TODO		if (json_store.ia7_config.prefs.developer !== undefined) developer = json_store.ia7_config.prefs.developer;
		if (json_store.ia7_config.prefs.tooltips !== undefined) show_tooltips = json_store.ia7_config.prefs.tooltips;
		// First time loading, set the default speech notifications
		if (speech_sound === undefined) {
			if ((json_store.ia7_config.prefs.speech_default_audio !== undefined) && (json_store.ia7_config.prefs.speech_default_audio == "yes" )) {
				speech_sound = "yes";
			} else {
				speech_sound = "no";
			}
		}
		//by default show speech banners
		if (speech_banner === undefined) {
			if ((json_store.ia7_config.prefs.speech_default_banner !== undefined) && (json_store.ia7_config.prefs.speech_default_banner == "no" )) {
				speech_banner = "no";
			} else {
				speech_banner = "yes";
			}
		}
		if ((json_store.ia7_config.prefs.notifications !== undefined) && (json_store.ia7_config.prefs.notifications == "no" )) {
			  	notifications = "disabled";
			  	speech_sound = "no";
			  	speech_banner = "no";
		} else {
				notifications = "enabled";
		}
		//cookies override default config unless use_cookies : no
        if (json_store.ia7_config.prefs.use_cookies == undefined || (json_store.ia7_config.prefs.use_cookies !== undefined && json_store.ia7_config.prefs.use_cookies == "yes")) {
            var decodedCookie = decodeURIComponent(document.cookie);
            var ca = decodedCookie.split(';');
            for (var i = 0; i <ca.length; i++) {
                var c = ca[i];
                while (c.charAt(0) == ' ') {
                    c = c.substring(1);
                }
                if (c.indexOf("speech_sound") == 0) {
                    speech_sound = c.substring(13, c.length);
                }
                if (c.indexOf("speech_banner") == 0) {
                    speech_banner = c.substring(14, c.length);
                }
                if (c.indexOf("display_mode") == 0) {
                    display_mode = c.substring(13, c.length);
                } 
                if (c.indexOf("developer") == 0) {
//TODO                    developer = c.substring(10, c.length);
                }                                           
            }
        }
        if (json_store.ia7_config.prefs.show_weather !== undefined  && json_store.ia7_config.prefs.show_weather == "no") {
            $('.mh-wi-text').hide();
            $('.mh-wi-icon').hide();
        } else {
            $('.mh-wi-text').show();
            $('.mh-wi-icon').show();   
        }     

	}
	if (getJSONDataByPath("collections") === undefined){
		// We need at minimum the basic collections data to render all pages
		// (the breadcrumb)
		// NOTE may want to think about how to handle dynamic changes to the 
		// collections list
		$.ajax({
			type: "GET",
			url: "/json/collections",
			dataType: "json",
			success: function( json ) {
				JSONStore(json);
				changePage();
			}
		});
	} 
	else {
		// Check for authorize
		authDetails();
		// Clear Options Entity by Default
		$("#toolButton").attr('entity', '');
		
		// Remove the RRD Last Updated 
		$('#Last_updated').remove();
				
		//Trim leading and trailing slashes from path
		var path = URLHash.path.replace(/^\/|\/$/g, "");
		if (path.indexOf('objects') === 0){
			loadList();
		}
		else if ((path.indexOf('vars') === 0) || (path.indexOf('vars_global') === 0) || (path.indexOf('vars_save') === 0)){
			loadVars();
		}
		else if (path.indexOf('prefs') === 0){
			var pref_name = path.replace(/\prefs\/?/,'');
			loadPrefs(pref_name);
		}		
		else if(URLHash._request == 'page'){
			var link = URLHash.link.replace(/\?+.*/,''); //HP for some reason, this often has the first arg with no value, ie ?bob
			var args = HashPathArgs(URLHash);
			if (args !== undefined) {
				args = args.replace(/\=undefined/img,''); //HP sometimes arguments are just items and not key=value...
				link += "?"+args;
			}

			$.get(link, function( data ) {
				
				$('#list_content').html("<div id='buffer_page' class='row top-buffer'>");
				$('#buffer_page').append("<div id='row_page' class='col-sm-12 col-sm-offset-0 col-md-10 col-md-offset-1 col-lg-8 col-lg-offset-2 mh-page-link'>");
				parseLinkData(link,data); //remove css & fix up Mr.House setup stuff
		
			});
		}
		else if(path.indexOf('print_log') === 0){
			print_log();
		}
		else if(path.indexOf('print_speaklog') === 0){
			print_log("speak");
		}
		else if(path.indexOf('display_table') === 0){
			var path_arg = path.split('?');
			display_table(path_arg[1]);
		}	
		else if(path.indexOf('floorplan') === 0){
			var path_arg = path.split('?');
			floorplan(path_arg[1]);
		}
		else if(path.indexOf('rrd') === 0){
			var path_arg = path.split('?');
			graph_rrd(path_arg[1],path_arg[2]);
		}
		else if(path.indexOf('history') === 0){
			var path_arg = path.split('?');
			object_history(path_arg[1],undefined,path_arg[2]);
		}					
		else if(URLHash._request == 'trigger'){
			trigger();
		}
		else { //default response is to load a collection
			loadCollection(URLHash._collection_key);
		}

		//update the breadcrumb: 
		// Weird end-case, The Group from browse items is broken with parents on the URL
		// Also have to change parents to type if the ending collection_keys are $<name>,
		$('#nav').html('');
		var collection_keys_arr = URLHash._collection_key;
		if (collection_keys_arr === undefined) collection_keys_arr = '0';
		collection_keys_arr = collection_keys_arr.split(',');
		var breadcrumb = '';
		for (var i = 0; i < collection_keys_arr.length; i++){
			var nav_link, nav_name;
			if (collection_keys_arr[i].substring(0,1) == "$"){
				//We are browsing the contents of an object, currently only 
				//group objects can be browsed recursively.  Possibly use different
				//prefix if other recursively browsable formats are later added
			
				nav_name = collection_keys_arr[i].replace("$", '');				    
				nav_link = '#path=/objects&parents='+nav_name;				
				if (collection_keys_arr.length > 2 && collection_keys_arr[collection_keys_arr.length-2].substring(0,1) == "$") nav_link = '#path=/objects&type='+nav_name; 
				if (nav_name == "Group") nav_link = '#path=objects&type=Group'; //Hardcode this use case
                //if type=Voice_Cmd, then we need to keep it for voice links to have a nice breadcrumb
				if (collection_keys_arr[i+1] !== undefined && collection_keys_arr[i+1] == "Voice_Cmd") nav_link = '#path=/objects&type=Voice_Cmd&category='+nav_name;
				if (json_store.objects !== undefined && json_store.objects[nav_name] !== undefined && json_store.objects[nav_name].label !== undefined) nav_name = (json_store.objects[nav_name].label);
			} else {
				if (json_store.collections[collection_keys_arr[i]] == undefined) continue; //last breadcrumb duplicated so we don't need it.
				nav_link = json_store.collections[collection_keys_arr[i]].link;
				nav_name = json_store.collections[collection_keys_arr[i]].name;
			}
			nav_link = buildLink (nav_link, breadcrumb + collection_keys_arr[i]);
			breadcrumb += collection_keys_arr[i] + ",";

			if (i == (collection_keys_arr.length-1)){
				$('#nav').append('<li class="active">' + nav_name + '</a></li>');
				$('title').html("MisterHouse - " + nav_name);
			} else {
				$('#nav').append('<li><a href="' + nav_link + '">' + nav_name + '</a></li>');
			}
		}
	}
}

function loadPrefs (config_name){ //show ia7 prefs, args ia7_prefs, ia7_rrd_prefs if no arg then both

	$('#list_content').html("<div id='prefs_table' class='row top-buffer'>");
	$('#prefs_table').append("<div id='prtable' class='col-sm-12 col-sm-offset-0 col-md-10 col-md-offset-1 col-lg-8 col-lg-offset-2 col-xs-11 col-xs-offset-0'>");
	var html = "<table class='table table-curved'><thead><tr>";
	var config_data;
	if (config_name === undefined || config_name === '')  config_name="ia7";
	if (config_name == "ia7") {
		config_data = json_store.ia7_config;
	} else if (config_name == "ia7_rrd") {
		$.ajax({
			type: "GET",
			async: false,  //async is always better, but since this is the only point of the sub, it's OK
			url: "/json/rrd_config",
			dataType: "json",
			success: function( json ) {
				config_data = json.data;
			}
		});
	}		
	html += "<th>"+ config_name + "_config.json </th></tr></thead><tbody>";
	for (var i in config_data){
		if ( typeof config_data[i] === 'object') {
			html += "<tr class='info'><td><b>"+ i + "</b></td></tr>";
			for (var j in config_data[i]) {
				if ( typeof config_data[i][j] === 'object') {
					html += "<tr class='info'><td style='padding-left:40px'>"+ j + "</td></tr>";
					for (var k in config_data[i][j]){
						 html += "<tr><td style='padding-left:80px'>"+k+" = "+config_data[i][j][k]+"</td></tr>";
					}
				} else {
					html += "<tr><td style='padding-left:40px'>"+j+" = "+config_data[i][j]+"</td></tr>"
				}
			}
		}	
	}

	html += "</tbody></table></div>";
	$('#prtable').html(html);

}

function parseLinkData (link,data) {

	data = data.replace(/<link[^>]*>/img, ''); //Remove stylesheets
	data = data.replace(/<title[^>]*>((\r|\n|.)*?)<\/title[^>]*>/img, ''); //Remove title
	data = data.replace(/<meta[^>]*>/img, ''); //Remove meta refresh
	data = data.replace(/<base[^>]*>/img, ''); //Remove base target tags
				
	if (link == "/bin/code_select.pl" || link == "/bin/code_unselect.pl") { //fix links in the code select / unselect modules
		var coll_key = window.location.href.substr(window.location.href.indexOf('_collection_key'))
		data = data.replace(/href=\/bin\/browse.pl(.*?)>/img, function (path,r1) {
			return 'href=/ia7/#_request=page&link=/bin/browse.pl'+r1+'&'+coll_key+',>';
		});
		data = data.replace(/\(<a name=.*?>back to top<\/a>\)/img, '');
		data = data.replace(/Category Index:/img,'');
		data = data.replace(/<a href='#.+?'>.*?<\/a>/img,'');
		}
	if (link == "/bin/items.pl") {
		var coll_key = window.location.href.substr(window.location.href.indexOf('_collection_key'))		
		data = data.replace(/href=\/bin\/items.pl/img, 'onclick="changePage()"');	
		data = data.replace(/action=\/bin\/items.pl/img, ''); // /ia7/#_request=page&link=/bin/items.pl&'+coll_key);
		data = data.replace(/form.submit\(\)/img, ''); // 'this.form.submit()');					
		data = data.replace(/\(<a name=.*?>back to top<\/a>\)/img, '');
		data = data.replace(/Item Index:/img,'');
		data = data.replace(/<a href='#.+?'>.*?<\/a>/img,'');
		data = data.replace(/input name='resp' value="\/bin\/items.pl"/img, 'input name=\'resp\' value=\"/ia7/#_request=page&link=/bin/items.pl&'+coll_key+'\"');
		data = data.replace(/<a href=\/RUN;\/bin\/items.pl\?Reload_code>/img, '<a onclick="\$.get(\'/RUN;last_response?Reload_code\')">');				
		
	}
	if (link == "/bin/iniedit.pl") {
		var coll_key = window.location.href.substr(window.location.href.indexOf('_collection_key'))	
		data = data.replace(/<input type=submit name=\"Switch\" value=\"Switch\">/img, '');	
		data = data.replace(/<input type=submit name=\"Reset Values\" value=\"Reset Values\">/img,'');
		data = data.replace(/<a href=\"\/bin\/iniedit.pl\">Back<\/a>/img,'<a onclick=\"changePage()\">Back<\/a>');
	
		//replace the back button with a reload
	}	
	if (link == "/bin/triggers.pl") { //fix links in the triggers modules
		var coll_key = window.location.href.substr(window.location.href.indexOf('_collection_key'))
		data = data.replace(/href=\/bin\/triggers.pl/img, 'onclick="changePage()"');
		data = data.replace(/\(<a name=.*?>back to top<\/a>\)/img, '');
		data = data.replace(/Trigger Index:/img,'');
		data = data.replace(/<a href='#.+?'>.*?<\/a>/img,'');
		data = data.replace(/input name='resp' value="\/bin\/triggers.pl"/img, 'input name=\'resp\' value=\"/ia7/#_request=page&link=/bin/triggers.pl&'+coll_key+'\"');
	}				
	if (link == "/ia5/news/main.shtml") { //fix links in the email module 1
		var coll_key = window.location.href.substr(window.location.href.indexOf('_collection_key'))
		data = data.replace(/<a href='\/email\/latest.html'>Latest emails<\/a>/img,'');
		data = data.replace(/href=\/email\/(.*?)>/img, function (path,r1) {
			return 'href=/ia7/#_request=page&link=/email/'+r1+'&'+coll_key+',>';
		});
		data = data.replace(/<a href=\"SET;&dir_index\(.*?\)\">(.*?)<\/a>/img, function (path,r1,r2) {
			return r1;
		});
		data = data.replace(/<a href='RUN;\/ia5\/news\/main.shtml\?Check_for_e_mail'>Check for new e mail<\/a>/img, '<button type="button" class="btn btn-default btn-voice-cmd" voice_cmd="Check_for_e_mail" onclick="\$.get(\'/RUN;last_response?select_cmd=Check_for_e_mail\')">Check for new email<\/button>');				
		data = data.replace(/<td>\+ Sort by /img,'<td>');		

	}
	if (link.indexOf('/email/') === 0) { //fix links in the email module 2
		data = data.replace(/<a href='#top'>Previous<\/a>.*?<br>/img, '');
		data = data.replace(/<a name='.*?' href='#top'>Back to Index<\/a>.*?<b>/img,'<b>');
		data = data.replace(/href='#\d+'/img,'');
	}
	if (link.indexOf('/comics/') === 0) { //fix links in the comics module
		var coll_key = window.location.href.substr(window.location.href.indexOf('_collection_key'))				
		data = data.replace(/<a href="(.*?)">(.*?)<\/a>/img,function (path,r1,r2) {
			return '<a href=/ia7/#_request=page&link=/comics/'+r1+'&'+coll_key+',>'+r2+'</a>';
		});	
		data = data.replace(/<img src="(.*?)"/img,function (path,r1) {
			return '<img src="/comics/'+r1+'"';
		});							
	}
	data = data.replace(/replace_current_ia7_version/img,ia7_ver); //this should really be a jquery call			
	data = data.replace(/href="\/bin\/SET_PASSWORD"/img,'onclick=\'authorize_modal("0")\''); //Replace old password function
	data = data.replace(/href="\/SET_PASSWORD"/img,'onclick=\'authorize_modal("0")\''); //Replace old password function 
//TODO clean up this regex?
	data = data.replace(/href=SET_PASSWORD/img,'onclick=\'authorize_modal("0")\''); //Special case, setup Mr.House without being logged in 


	$('#row_page').html(data);
	$('#mhresponse').submit( function (e) { //allow for forms with id=mhresponse to show data returned in modal
		e.preventDefault();
		var form = $(this);
        var btn = $(this).find("input[type=submit]:focus" );
        var form_data = $(this).serializeArray();
  		if (btn.attr('name') !== undefined) {
  			form_data.push({name : btn.attr('name'), value : btn.attr('value')});
  		}		
			$.ajax({
				type: "POST",
				url: form.attr('action'),
				data: form_data,
				success: function(data){
					data = data.replace(/<link[^>]*>/img, ''); //Remove stylesheets
					data = data.replace(/<title[^>]*>((\r|\n|.)*?)<\/title[^>]*>/img, ''); //Remove title
					data = data.replace(/<meta[^>]*>/img, ''); //Remove meta refresh
					data = data.replace(/<base[^>]*>/img, ''); //Remove base target tags

					var start = data.toLowerCase().indexOf('<body>') + 6;
					var end = data.toLowerCase().indexOf('</body>');

					if (form.attr('action') === "/bin/triggers.pl?add" && ! data.match(/Not authorized to make updates/))  {
						changePage();
					} else if (form.attr('action') === "/bin/iniedit.pl") {
						parseLinkData("/bin/iniedit.pl",data);
//TODO parse data							 
					} else {
						$('#lastResponse').find('.modal-body').html(data.substring(start, end));
						$('#lastResponse').modal({
							show: true
						});
					}
				}
			});
	});
	$('#mhfile').change( function (e) { //item fix
		e.preventDefault();
		var form = $(this);
        var name = $(this).find(":selected").text();
        var form_data = $(this).serializeArray();
        $.ajax({
            type: "POST",
            url: "/bin/items.pl",
            data: form_data,
            success: function(data){
                    parseLinkData("/bin/items.pl",data);
            }
        });
	});
	$('#mhresponse :input:not(:text)').change(function() {
//TODO - don't submit when a text field changes
		$('#mhresponse').submit();
 	});			
	$('#mhexec a').click( function (e) {
		e.preventDefault();
		var url = $(this).attr('href');
		url = url.replace(/;(.*?)\?/,'?');
		$.get( url, function(data) {
		});
		changePage();
	});
}


function loadVars (){ //variables list
	var URLHash = URLToHash();
	$.ajax({
		type: "GET",
		url: "/json/"+HashtoJSONArgs(URLHash),
		dataType: "json",
		success: function( json ) {
			JSONStore(json);
			var table = false;
			if (json.meta.path[0] != 'vars') table = true;
			var list_output = "";
			var keys = [];
			for (var key in json.data) {
				keys.push(key);
			}
			keys.sort ();
			
			if (table) {
			    list_output = "<table class='table table-curved'><thead><tr>";
		        list_output += "<th>Variable</th><th>Value</th>";
		        list_output += "</tr></thead><tbody>";

		        for (var i = 0; i < keys.length; i++){
				    var value = json.data[keys[i]];
				    var name = keys[i];
				    var list_html
				    list_output += "<tr><td>"+name+"</td><td>"+value+"</td></tr>";
				}
				list_output += "</tbody></table>";			
			} else {
			    for (var i = 0; i < keys.length; i++){
				    var value = variableList(json.data[keys[i]]);
				    var name = keys[i];
				    var list_html
				    list_output += "<ul><li><b>" + name + ":</b>" + value+"</li></ul>";
				}
			}
			//list_output += (list_html);
		
			//Print list output if exists;
			if (list_output !== ""){
				$('#list_content').html('');
				$('#list_content').append("<div id='buffer_vars' class='row top-buffer'>");
				$('#buffer_vars').append("<div id='row_vars' class='col-sm-12 col-sm-offset-0 col-md-10 col-md-offset-1 col-lg-8 col-lg-offset-2'>");
				$('#row_vars').append(list_output);
			}
		}
	});
}

//Recursively parses a JSON entity to print all variables 
function variableList(value){
	var retValue = '';
	if (typeof value == 'object' && value !== null) {
		var keys = [];
		for (var key in value) {
			keys.push(key);
		}
		keys.sort ();
		for (var i = 0; i < keys.length; i++){
			retValue += "<ul><li><b>" + keys[i] +":</b>"+ variableList(value[keys[i]]) + "</li></ul>";
		}
	} else {
		retValue = "<ul><li>" + value+"</li></ul>";
	}
	return retValue;
}

//Prints a JSON generated list of MH objects
var loadList = function() {
	var URLHash = URLToHash();
	if (getJSONDataByPath("objects") === undefined){
		// We need at least some basic info on all objects
		$.ajax({
			type: "GET",
			url: "/json/objects?fields=sort_order,members,label",
			dataType: "json",
			success: function( json ) {
				JSONStore(json);
				loadList();
			}
		});
		return;
	}
	var collection_key = URLHash._collection_key;
	var button_text = '';
	var button_html = '';
	var entity_arr = [];
	URLHash.fields = "category,label,sort_order,members,state,states,state_log,hidden,type,text,schedule,logger_status,link";
	$.ajax({
		type: "GET",
		url: "/json/"+HashtoJSONArgs(URLHash),
		dataType: "json",
		success: function( json ) {
			//Save this to the JSON store
			JSONStore(json);
			
			// Catch Empty Responses
			if ($.isEmptyObject(json.data)) {
				entity_arr.push("No objects found");
			}

			// Build sorted list of objects
			var entity_list = [];
			for(var k in json.data) entity_list.push(k);
			var sort_list;
			if (URLHash.parents !== undefined && 
				json_store.objects[URLHash.parents] !== undefined &&
				json_store.objects[URLHash.parents].sort_order !== undefined) {
				sort_list = json_store.objects[URLHash.parents].sort_order;
			}
			
			// Set Options Modal Entity
			// "Parent" entity can be different depending on the manner in which
			// the list is requested, need to figure out a heirarchy at some point
			// Currently, we only handle groups, so we only deal with parent
			if (URLHash.parents !== undefined) {
				$("#toolButton").attr('entity', URLHash.parents);
			}			

			for (var i = 0; i < entity_list.length; i++) {
				var entity = entity_list[i];
				if (json_store.objects[entity].type === undefined){
					// This is not an entity, likely a value of the root obj
					continue;
				}
				if (json_store.objects[entity].hidden !== undefined){
					// This is an entity with the hidden property, so skip it
					continue;
				}
				if (json_store.objects[entity].type == "Voice_Cmd"){
					button_text = json_store.objects[entity].text;
					//Choose the first alternative of {} group
					while (button_text.indexOf('{') >= 0){
						var regex = /([^\{]*)\{([^,]*)[^\}]*\}(.*)/;
						button_text = button_text.replace(regex, "$1$2$3");
					}
					//Put each option in [] into toggle list, use first option by default
					if (button_text.indexOf('[') >= 0){
						var regex = /(.*)\[([^\]]*)\](.*)/;
						var options = button_text.replace(regex, "$2");
						var button_text_start = button_text.replace(regex, "$1");
						var button_text_end = button_text.replace(regex, "$3");
						options = options.split(',');
						button_html = '<div class="btn-group btn-block fillsplit">';
						button_html += '<div class="leadcontainer">';
						button_html += '<button entity="'+entity+'" type="button" class="btn btn-default dropdown-lead btn-lg btn-list btn-voice-cmd navbutton-padding">'+button_text_start + "<u>" + options[0] + "</u>" + button_text_end+'</button>';
						button_html += '</div>';
						button_html += '<button type="button" class="btn btn-default btn-lg dropdown-toggle pull-right btn-list-dropdown navbutton-padding" data-toggle="dropdown">';						
						button_html += '<span class="caret dropdown-caret"></span>';
						button_html += '<span class="sr-only">Toggle Dropdown</span>';
						button_html += '</button>';
						button_html += '<ul class="dropdown-menu dropdown-voice-cmd" role="menu">';
						for (var j=0,len=options.length; j<len; j++) { 
							button_html += '<li><a href="#">'+options[j]+'</a></li>';
						}
						button_html += '</ul>';
						button_html += '</div>';
					}
					else {
						button_html = "<div style='vertical-align:middle'><button entity='"+entity+"' type='button' class='btn btn-default btn-lg btn-block btn-list btn-voice-cmd navbutton-padding'>";
						button_html += "" +button_text+"</button></div>";
					}
					entity_arr.push(button_html);
				} //Voice Command Button
				else if(json_store.objects[entity].type == "Group" ||
					    json_store.objects[entity].type == "Type" ||
					    json_store.objects[entity].type == "Category"){
					var object = json_store.objects[entity];
					button_text = entity;
					if (object.label !== undefined) button_text = object.label;
					//Put entities into button
					var filter_args = "parents="+entity;
					if (json_store.objects[entity].type == "Category"){
						filter_args = "type=Voice_Cmd&category="+entity;
					}
					else if (json_store.objects[entity].type == "Type") {
						filter_args = "type="+entity;
					}
					var dbl_btn = "";
					if (json_store.ia7_config.prefs.always_double_buttons == "yes") {
						if (entity.length < 30) dbl_btn = "<br><br>"; 
					}
					button_html = "<div style='vertical-align:middle'><a role='button' listType='objects'";
					button_html += "class='btn btn-default btn-lg btn-block btn-list btn-division navbutton-padding'";
					button_html += "href='#path=/objects&"+filter_args+"&_collection_key="+collection_key+",$" + entity + "' >";
					button_html += "" +button_text + dbl_btn +"</a></div>";
					entity_arr.push(button_html);
					continue;
				}
				else {
					// These are controllable MH objects
					json_store.objects[entity] = json_store.objects[entity];
					var name = entity;
					var color = getButtonColor(json_store.objects[entity].state);
					if (json_store.objects[entity].label !== undefined) name = json_store.objects[entity].label;
					//Put objects into button
					var dbl_btn = "";
					if (json_store.ia7_config.prefs.always_double_buttons == "yes") {
						if (name.length < 30) dbl_btn = "<br>"; 
					}
					// direct control item, differentiate the button
					var btn_direct = "";
					if (json_store.ia7_config.objects !== undefined && json_store.ia7_config.objects[entity] !== undefined) {
                		if (json_store.ia7_config.objects[entity].direct_control !== undefined && json_store.ia7_config.objects[entity].direct_control == "yes") {
                            btn_direct = "btn-direct";
                		}
                	} 
					button_html = "<div style='vertical-align:middle'><button entity='"+entity+"' ";
					button_html += "class='btn btn-"+color+" btn-lg btn-block btn-list btn-popover "+btn_direct+" btn-state-cmd navbutton-padding'>";
					button_html += name+dbl_btn+"<span class='pull-right'>"+json_store.objects[entity].state+"</span></button></div>";
					entity_arr.push(button_html);
				}
			}//entity each loop
			
			//loop through array and print buttons
			var row = 0;
			var column = 1;
			for (var i = 0; i < entity_arr.length; i++){
				if (i === 0) {
					$('#list_content').html('');
				}
				if (column == 1){
					$('#list_content').append("<div id='buffer"+row+"' class='row top-buffer'>");
					$('#buffer'+row).append("<div id='row" + row + "' class='col-sm-12 col-sm-offset-0 col-md-10 col-md-offset-1 col-lg-8 col-lg-offset-2'>");
				}
				$('#row'+row).append("<div class='col-sm-4'>" + entity_arr[i] + "</div>");

				if (column == 3){
					column = 0;
					row++;
				}
				column++;
			}
			
			//Affix functions to all button clicks
			$(".dropdown-voice-cmd > li > a").click( function (e) {
				var button_group = $(this).parents('.btn-group');
				button_group.find('.leadcontainer > .dropdown-lead >u').html($(this).text());
				e.preventDefault();
				generateTooltips();
			});
			$(".btn-voice-cmd").click( function () {
				var voice_cmd = $(this).text().replace(/ /g, "_");
				var url = '/RUN;last_response?select_cmd=' + voice_cmd;
				var entity=$(this).attr("entity");
				$.get( url, function(data) {
				    if (json_store.objects[entity].link !== undefined) {
				    //if link starts with /ia7/#path= then it is an IA7 redirect
				        var collid = $(location).attr('href').split("_collection_key=");
				        var link = json_store.objects[entity].link+"&type=Voice_Cmd&_collection_key="+collid[1]+",Voice_Cmd";
				        window.location.assign(link);
				    } else {
					    var start = data.toLowerCase().indexOf('<body>') + 6;
					    var end = data.toLowerCase().indexOf('</body>');
					    $('#lastResponse').find('.modal-body').html(data.substring(start, end));
					    $('#lastResponse').modal({
						    show: true
					    });
					}
				});
			});
			$(".btn-state-cmd").click( function () {
				var entity = $(this).attr("entity");
				if (json_store.ia7_config.objects !== undefined && json_store.ia7_config.objects[entity] !== undefined) {
                	if (json_store.ia7_config.objects[entity].direct_control !== undefined && json_store.ia7_config.objects[entity].direct_control == "yes") {
                         var new_state = "";
                         var possible_states = 0;
                         for (var i = 0; i < json_store.objects[entity].states.length; i++){
                         	if (filterSubstate(json_store.objects[entity].states[i]) == 1) continue;
                         	possible_states++;
				if (json_store.objects[entity].states[i] !== json_store.objects[entity].state) new_state = json_store.objects[entity].states[i];

                         	}
						if ((possible_states > 2) || (new_state == "")) alert("Check configuration of "+entity+". "+possible_states+" states detected for direct control object. State is "+new_state);
						url= '/SET;none?select_item='+entity+'&select_state='+new_state;
						$.get( url);
                	} else {
                		create_state_modal(entity);
                	}
				} else {				
					create_state_modal(entity);
				}
			});
			$(".btn-state-cmd").mayTriggerLongClicks().on( 'longClick', function() {		
				var entity = $(this).attr("entity");
				create_state_modal(entity);
			});	
 
		    generateTooltips();
		}
	});
	// Continuously check for updates if this was a group type request
	updateList(URLHash.path);

};//loadlistfunction

 //Add tooltips to any truncated buttons
var generateTooltips = function () {
    if ((show_tooltips) && (mobile_device() == "no") ){ //no sense in having tooltips on a touch device
	    $(".btn").each(function( index ) {
	        if ($(this)[0].scrollWidth > 0) {
	            //if scrollWidth is greater than outerWidth then bootstrap has truncated the button text
		        if ($(this)[0].scrollWidth > $(this).outerWidth()) {
                    $(this).attr('data-toggle', 'tooltip');
                    $(this).attr('data-placement', 'auto bottom');
                    $(this).attr('data-original-title', $(this).text());
                    $(this).attr('title', $(this).text());
                } else {
                    $(this).attr('data-original-title', '');
                    $(this).attr('title', '');                
                }            
	            $('[data-toggle="tooltip"]').tooltip(); 
            }
        });
    }	
}

var getButtonColor = function (state) {
	var color = "default";
	if (state !== undefined) state = state.toLowerCase();
	if (state == "on" || state == "open" || state == "disarmed" || state == "unarmed" || state == "ready" || state == "dry" || state == "up" || state == "100%" || state == "online" || state == "unlocked") {
		 color = "success";
	} else if (state == "motion" || state == "armed" || state == "wet" || state == "fault" || state == "down" || state == "offline" || state == "locked") {
		 color = "danger";
	} else if (state == undefined || state == "unknown" ) {
		 color = "purple";
	} else if (state == "low" || state == "med" || state.indexOf('%') >= 0 || state == "light" || state == "heating" || state == "heat") { 
		 color = "warning";
	} else if (state == "cooling" || state == "cool") {
		 color = "info";
	}
	if (json_store.ia7_config.state_colors !== undefined
            && json_store.ia7_config.state_colors[state] !== undefined) {
		color = "purple";
		if (json_store.ia7_config.state_colors[state] == "green") {
			color = "success";
		} else if (json_store.ia7_config.state_colors[state] == "red") {
			color = "danger";
		} else if (json_store.ia7_config.state_colors[state] == "blue") {
			color = "info";
		} else if (json_store.ia7_config.state_colors[state] == "orange") {
			color = "warning";
		} else if (json_store.ia7_config.state_colors[state] == "default") {
			color = "default";
		}
	}
	return color;
};

var filterSubstate = function (state, slider) {
 	// ideally the gear icon on the set page will remove the filter
 	// slider=1 will filter out all numeric states
    var filter = 0
    // remove 11,12,13... all the mod 10 states
    if (state.indexOf('%') >= 0) {
    
       var number = parseInt(state, 10)
       if ((number % json_store.ia7_config.prefs.substate_percentages != 0) || (slider !== undefined && slider == 1)) {
         filter = 1
        }
    }
    if ((slider !== undefined && slider == 1) && !isNaN(state)) filter = 1;
    
	if (state !== undefined) state = state.toLowerCase();    
    if (state == "manual" ||
    	state == "double on" ||
    	state == "double off" ||
    	state == "triple on" ||
    	state == "triple off" ||
    	state == "status on" ||
    	state == "status off" ||
    	state == "status on" ||
    	state == "clear" ||
    	state == "setramprate" ||
    	state == "setonlevel" ||
    	state == "addscenemembership" ||
    	state == "setsceneramprate" ||
    	state == "deletescenemembership" ||
    	state == "disablex10transmit" ||
    	state == "enablex10transmit" ||
    	state == "set ramp rate" ||
    	state == "set on level" ||
    	state == "add to scene" ||
    	state == "remove from scene" ||
    	state == "set scene ramp rate" ||
    	state == "disable transmit" ||
    	state == "enable transmit" ||
    	state == "disable programming" ||
    	state == "enable programming" ||
    	state == "0%" ||
    	state == "100%" ||
    	state == "error" ||
        state == "status" ) {
        filter = 1
    }
    
    return filter;
};
        
var sliderObject = function (states) {

    //if an object has at least 4 numeric values, return yes
    var count = 0;
    for(var i = 0; i < states.length; i++)
        {
        if ( (!isNaN(states[i])) ||  (states[i].indexOf('%') != -1)) count++;
        }
    if (count > 3) return 1;

    return 0;
}

var sliderDetails = function (states) {

    var pct = 0;
    var slider_array = [];
    for(var i = 0; i < states.length; i++) {
        var val = states[i];
        if(states[i].indexOf('%') != -1) pct=1;
        val = val.replace(/\%/g,'');
        if (!isNaN(val)) {
            slider_array.push(val)
        }
    }
    var values = slider_array.sort(function(a, b){return a-b});
    var min = 0; //values[0];
    var max = values.length -1;
    var steps = parseInt((max - min) / (values.length - 1));
    return {
        min: min,
        max: max,
        values: values,
        steps: steps,
        pct: pct
    };
}

var sortArrayByArray = function (listArray, sortArray){
	listArray.sort(function(a,b) {
		if (sortArray.indexOf(a) < 0) {
			return 1;
		}
		else if (sortArray.indexOf(b) < 0) {
			return -1;
		}
		else {
			return sortArray.indexOf(a) - sortArray.indexOf(b);
		}
	});
	return listArray;
};

//Used to dynamically update the state of objects
var updateList = function(path) {
	var URLHash = URLToHash();
	URLHash.fields = "state,state_log,schedule,logger_status,type";
	URLHash.long_poll = 'true';
	URLHash.time = json_store.meta.time;
	if (updateSocket !== undefined && updateSocket.readyState != 4){
		// Only allow one update thread to run at once
		updateSocket.abort();
	}
	var split_path = HashtoJSONArgs(URLHash).split("?");
	var path_str = split_path[0];
	var arg_str = split_path[1];
	updateSocket = $.ajax({
		type: "GET",
		url: "/LONG_POLL?json('GET','"+path_str+"','"+arg_str+"')",
		dataType: "json",
		success: function( json, textStatus, jqXHR) {
			if (jqXHR.status == 200) {
				JSONStore(json);
				for (var entity in json.data){
					if (json.data[entity].type === undefined){
						// This is not an entity, skip it
						continue;
					}
					var color = getButtonColor(json.data[entity].state);
					$('button[entity="'+entity+'"]').find('.pull-right').text(
						json.data[entity].state);
					$('button[entity="'+entity+'"]').removeClass("btn-default");
					$('button[entity="'+entity+'"]').removeClass("btn-success");
					$('button[entity="'+entity+'"]').removeClass("btn-warning");
					$('button[entity="'+entity+'"]').removeClass("btn-danger");
					$('button[entity="'+entity+'"]').removeClass("btn-info");
					$('button[entity="'+entity+'"]').addClass("btn-"+color);
					
				}
			}
			if (jqXHR.status == 200 || jqXHR.status == 204) {
				//Call update again, if page is still here
				//KRK best way to handle this is likely to check the URL hash
				if (URLHash.path == path){
					//While we don't anticipate handling a list of groups, this 
					//may error out if a list was used
					updateList(path);
				}
			}
		}, // End success
	});  //ajax request
};//loadlistfunction

var updateItem = function(item,link,time) {
	var URLHash = URLToHash();
	URLHash.fields = "state";
	URLHash.long_poll = 'true';
	//URLHash.time = json_store.meta.time;
	if (updateSocket !== undefined && updateSocket.readyState != 4){
		// Only allow one update thread to run at once
		updateSocket.abort();
	}
	if (time === undefined) {
		time = "";
	}
	var path_str = "/objects"  // override, for now, would be good to add voice_cmds
	var arg_str = "fields=state,states,label,state_log,schedule,logger_status&long_poll=true&items="+item+"&time="+time;
	updateSocket = $.ajax({
		type: "GET",
		url: "/LONG_POLL?json('GET','"+path_str+"','"+arg_str+"')",		
		dataType: "json",
		success: function( json, textStatus, jqXHR) {
			var requestTime = time;
			if (jqXHR.status == 200) {
				JSONStore(json);
				requestTime = json_store.meta.time;
				var color = getButtonColor(json.data[item].state);
				$('button[entity="'+item+'"]').find('.pull-right').text(
					json.data[item].state);
				$('button[entity="'+item+'"]').removeClass("btn-default");
				$('button[entity="'+item+'"]').removeClass("btn-success");
				$('button[entity="'+item+'"]').removeClass("btn-warning");
				$('button[entity="'+item+'"]').removeClass("btn-danger");
				$('button[entity="'+item+'"]').removeClass("btn-info");
				$('button[entity="'+item+'"]').addClass("btn-"+color);
			}
			if (jqXHR.status == 200 || jqXHR.status == 204) {

				if (URLHash.link == link || link == undefined){
//					//While we don't anticipate handling a list of groups, this 
//					//may error out if a list was used
					//testingObj(json_store.meta.time);
				updateItem(item,URLHash.link,requestTime);
				}
			}
		}, // End success
	});  //ajax request
}

var updateStaticPage = function(link,time) {
// Loop through objects and get entity name
// update entity based on mh module.
	var entity;
	var states_loaded = 0;
	if (link != undefined) {
  		states_loaded = 1;
	}
	var items = '';
    $('button[entity]').each(function(index) {
        if (index != 0) { //TODO really kludgy
          items += $(this).attr('entity')+",";
   		 }
   	})
	var URLHash = URLToHash();
	URLHash.fields = "state,states,state_log,schedule,logger_status,label,type";
	URLHash.long_poll = 'true';
	URLHash.time = json_store.meta.time;
	if (updateSocket !== undefined && updateSocket.readyState != 4){
		// Only allow one update thread to run at once
		updateSocket.abort();
	}

	var path_str = "/objects"  // override, for now, would be good to add voice_cmds
	var arg_str = "fields=state%2Cstates%2Cstate_log%2Cschedule%2Clogger_status%2Clabel&long_poll=true&items="+items+"&time="+time;

	updateSocket = $.ajax({
		type: "GET",
		url: "/LONG_POLL?json('GET','"+path_str+"','"+arg_str+"')",
		dataType: "json",
		success: function( json, textStatus, jqXHR) {
			var requestTime = time;
			if (jqXHR.status == 200) {
				JSONStore(json);
				requestTime = json_store.meta.time;
				$('button[entity]').each(function(index) {
					if ($(this).attr('entity') != '' && json.data[$(this).attr('entity')] != undefined ) { //need an entity item for this to work.
						entity = $(this).attr('entity');
						var color = getButtonColor(json.data[entity].state);
						$('button[entity="'+entity+'"]').find('.pull-right').text(json.data[entity].state);
						$('button[entity="'+entity+'"]').removeClass("btn-default");
						$('button[entity="'+entity+'"]').removeClass("btn-success");
						$('button[entity="'+entity+'"]').removeClass("btn-warning");
						$('button[entity="'+entity+'"]').removeClass("btn-danger");
						$('button[entity="'+entity+'"]').removeClass("btn-info");
						$('button[entity="'+entity+'"]').addClass("btn-"+color);
						if (json_store.ia7_config.objects[entity] !== undefined && 
						    json_store.ia7_config.objects[entity].direct_control !== undefined && 
						    json_store.ia7_config.objects[entity].direct_control == "yes") $('button[entity="'+entity+'"]').addClass("btn-direct");
						
						//don't run this if stategrp0 exists	
						if (states_loaded == 0) {
			                $(".btn-state-cmd").click( function () {
								var entity = $(this).attr("entity");
								if (json_store.ia7_config.objects !== undefined && json_store.ia7_config.objects[entity] !== undefined) {
                					if (json_store.ia7_config.objects[entity].direct_control !== undefined && json_store.ia7_config.objects[entity].direct_control == "yes") {
                         				var new_state = "";
                         				var possible_states = 0;
                         				for (var i = 0; i < json_store.objects[entity].states.length; i++){
                         					if (filterSubstate(json_store.objects[entity].states[i]) == 1) continue;
                         					possible_states++;
											if (json_store.objects[entity].states[i] !== json_store.objects[entity].state) new_state = json_store.objects[entity].states[i];

                         				}
										if ((possible_states > 2) || (new_state == "")) alert("Check configuration of "+entity+". "+possible_states+" states detected for direct control object. State is "+new_state);
										url= '/SET;none?select_item='+entity+'&select_state='+new_state;
										$.get( url);
                					} else {
                					create_state_modal(entity);
                					}
								} else {				
									create_state_modal(entity);
								}
							});
						}																
					}
					generateTooltips();
			
				});
			}
			if (jqXHR.status == 200 || jqXHR.status == 204) {
				//Call update again, if page is still here
				//KRK best way to handle this is likely to check the URL hash
				if (URLHash.link == link || link == undefined){
					//While we don't anticipate handling a list of groups, this 
					//may error out if a list was used
					updateStaticPage(URLHash.link,requestTime);
				}
			}
		}, 
	});  
}

function authDetails() {
	if (json_store.collections[700] == undefined) {
		if ($(".alert-err").length == 0 ) something_went_wrong("Collections","Collection ID 700: Authorize, is not defined in your collections.json!");
	} else {
		if (json_store.collections[700].user !== undefined) {
   			if (json_store.collections[700].user == "0") {
    			json_store.collections[700].name = "Log in";
    			json_store.collections[700].icon = "fa-lock";
    			authorized = false;
   				$(".fa-gear").css("color", "red");
   			} else {
    			json_store.collections[700].name = "Log out "+json_store.collections[700].user+"...";
    			json_store.collections[700].icon = "fa-unlock";   		   		
    			authorized = true;
    			$(".fa-gear").css("color", "green");
    			if (json_store.collections[700].user == "admin") {
        			$(".fa-gear").css("color", "purple");
				}
   			}
   		}
   	}
}
	
//Prints all of the navigation items for Ia7
var loadCollection = function(collection_keys) {
	if (collection_keys === undefined) collection_keys = '0';
	var collection_keys_arr = collection_keys.split(",");
	var last_collection_key = collection_keys_arr[collection_keys_arr.length-1];
	var entity_arr = [];
	var items = "";
	var entity_sort = json_store.collections[last_collection_key].children;
	if (entity_sort == undefined) {
	    something_went_wrong("Collections","Problem with collections.json. Check the print log");
	    return;
	}
	if (entity_sort.length <= 0){
		entity_arr.push("Childless Collection");
	}

	for (var i = 0; i < entity_sort.length; i++){
		var collection = entity_sort[i];
		if (!(collection in json_store.collections)) continue;

		var link = json_store.collections[collection].link;
		var icon = json_store.collections[collection].icon;
		var name = json_store.collections[collection].name;
		var mode = json_store.collections[collection].mode;
		var keys = json_store.collections[collection].keys; //for legacy CGI scripts to recreate proper URL
		var item = json_store.collections[collection].item;
		
		if (item !== undefined) {
			if (json_store.objects === undefined || json_store.objects[item] === undefined) {
				var path_str = "/objects";
				var arg_str = "fields=state,states,label,state_log,schedule,logger_status,&items="+item;
				$.ajax({
					type: "GET",
					url: "/json"+path_str+"?"+arg_str,
					dataType: "json",
					success: function( json ) {
						JSONStore(json);
						loadCollection(collection_keys);
						}
				});
			} else {
                var btn_direct = "";
                if (json_store.ia7_config.objects !== undefined 
                        && json_store.ia7_config.objects[item] !== undefined
                        && json_store.ia7_config.objects[item].direct_control !== undefined 
                        && json_store.ia7_config.objects[item].direct_control == "yes") {
                    btn_direct = "btn-direct";
                }

				var name = item;
				var color = getButtonColor(json_store.objects[item].state);
				if (json_store.objects[item].label !== undefined) name = json_store.objects[item].label;
				var dbl_btn = "";
				if (name.length < 30) dbl_btn = "<br>"; 
				var button_html = "<div style='vertical-align:middle'><button entity='"+item+"' ";
				button_html += "class='btn  btn-"+color+" btn-lg btn-block btn-list btn-popover "+ btn_direct +" btn-state-cmd navbutton-padding'>";
				button_html += name+dbl_btn+"<span class='pull-right'>"+json_store.objects[item].state+"</span></button></div>";
			    button_html = "<div class='col-sm-4' colid='"+i+"'>" + button_html + "</div>";
				entity_arr.push(button_html);
				items += item+",";		
			}
		
		} else {		
			if (json_store.collections[collection].iframe !== undefined) {
				link = "/ia7/include/iframe.shtml?"+json_store.collections[collection].iframe;
			}
			var hidden = "";
			if (mode != display_mode && mode != undefined ) hidden = "hidden"; //Hide any simple/advanced buttons
			var next_collection_keys = collection_keys + "," + entity_sort[i];
			if (keys === "true") {
				var arg = "?";
				if (link.indexOf("?") >= 0 ) { //already has arguments, so just add one on
					arg = "&";
				}
				link += arg+"ia7="+next_collection_keys;
			}		
			link = buildLink (link, next_collection_keys);
			if (json_store.collections[collection].external !== undefined) {
				link = json_store.collections[collection].external;
			}
			var icon_set = "fa";
			var button_html;
			if (icon.indexOf("wi-") !=-1) icon_set = "wi";
			if (json_store.collections[collection].response_modal !== undefined && json_store.collections[collection].response_modal == "true") {
				var reload_modal = "false";
				if (json_store.collections[collection].reload_modal !== undefined) {
					reload_modal = json_store.collections[collection].reload_modal;
				}
				button_html = "<a link-type='collection' modal='"+link+"' reload_modal='"+reload_modal+"' class='btn btn-default btn-lg btn-block btn-list btn-resp-modal "+hidden+" navbutton-padding' role='button'><i class='"+icon_set+" "+icon+" icon-larger fa-2x fa-fw'></i>"+name+"</a>";
			} else {			
				button_html = "<a link-type='collection' href='"+link+"' class='btn btn-default btn-lg btn-block btn-list "+hidden+" navbutton-padding' role='button'><i class='"+icon_set+" "+icon+" icon-larger fa-2x fa-fw'></i>"+name+"</a>";
			}
			button_html = "<div class='col-sm-4' colid='"+collection+"'>" + button_html + "</div>";
			entity_arr.push(button_html);
		}
	}
	//loop through array and print buttons
	var row = 0;
	var column = 1;
	for (var i = 0; i < entity_arr.length; i++){
		if (column == 1){
            if (row === 0){
                $('#list_content').html('');
            }
			$('#list_content').append("<div id='buffer"+row+"' class='row top-buffer'>");
			$('#buffer'+row).append("<div id='row" + row + "' class='col-sm-12 col-sm-offset-0 col-md-10 col-md-offset-1 col-lg-8 col-lg-offset-2'>");
		}
//		$('#row'+row).append("<div class='col-sm-4' colid='"+i+"'>" + entity_arr[i] + "</div>");
		$('#row'+row).append(entity_arr[i]);

		if (column == 3){
			column = 0;
			row++;
		}
		column++;
	}
	
	generateTooltips();	

    //turn on long clicks on all buttons if in developer mode
//TODO error checking on fields
	$('.btn').mayTriggerLongClicks().on( 'longClick', function() {		
         if (developer === true) {
            var cls = $(this).parent().attr('class');
            if (!cls.match('ui-sortable-helper')) {
                var colid = $(this).parent().attr("colid");
                var URLHash=URLToHash();
                var col_parent = URLHash._collection_key.substr(URLHash._collection_key.lastIndexOf(',') + 1);

                var html = "<form class='form-horizontal'>";
                html +=  '<div class="form-group"><label for="col_id" class="control-label col-sm-2">CollectionID</label><div class="col-sm-10">';
                html += '<input type="text" class="form-control" id="col_id" name="cid" value="'+colid+'" readonly></div></div>';

                var parent;
                if (col_parent == 0) {
                    parent = "Home";
                } else {
                    parent = json_store.collections[col_parent].name;
                }                
                html +=  '<div class="form-group"><label for="col_parent" class="control-label col-sm-2">Page</label><div class="col-sm-10">';
                html += '<select class="form-control" id="col_parent" name="cparent">';

                var cids=0;
                for (var key in json_store.collections){
                    if (json_store.collections.hasOwnProperty(key)) {
                        if (json_store.collections[key].children !== undefined) {
                            var name = "Home";
                            if (json_store.collections[key].name !== undefined) name = json_store.collections[key].name
                            var selected = "";
                            if (key == col_parent) selected = "selected";
                            html += '<option value="'+key+'" '+selected+'>'+key+' ('+name+')</option>';
                        }
                    }
                }

                html += '</select></div></div>'
                if (json_store.collections[colid].children !== undefined) {
                    html +=  '<div class="form-group"><label for="col_children" class="control-label col-sm-2">Children</label><div class="col-sm-10">';
                    html += '<input type="text" class="form-control" id="col_children" name="cchild" value="'+json_store.collections[colid].children+'" readonly></div></div>';
                }

                html += '<div class="form-group"><label for="col_name" class="control-label col-sm-2">Name</label><div class="col-sm-10">';
                var name = '';
                if (json_store.collections[colid].name !== undefined) name = json_store.collections[colid].name;
			    html += '<input type="text" class="form-control" id="col_name" name="name" value="'+name+'"></div></div>';

                //var icos = get_icons;
			    var icon_set = "fa";
			    var icon = json_store.collections[colid].icon
			    if (icon.indexOf("wi-") !=-1) icon_set = "wi";
                html +=  '<div class="form-group"><label for="col_icon" class="control-label col-sm-2">Icon</label><div>';
                html += '<select class="form-group selectpicker col-sm-10">';
//                html += '<option data-icon="'+json_store.collections[colid].icon+'" value="'+json_store.collections[colid].icon+'" selected>'+json_store.collections[colid].icon+'</option>';
                html += "<option data-content='<span><i class=&quot;"+icon_set+' '+icon+"&quot;></i></span>&nbsp;&nbsp;"+icon+"' value='"+icon+"' selected>"+icon+"</option>";

//                html += '<input type="text" class="form-control" id="col_icon" name="cicon" value="'+json_store.collections[colid].icon+'" readonly></div></div>';
                html += '</select></div></div>'

                var mode = "simple";
                if (json_store.collections[colid].mode !== undefined) mode = json_store.collections[colid].mode;

                var checked = ""
                if (mode == "advanced") checked = "checked";
                html += '<div class="form-group"><label for="col_mode" class="control-label col-sm-2">Mode</label><div class="col-sm-10"><div class="checkbox">';
                html += '<label><input type="checkbox" id="col_mode" name="cmode" value="Advanced" '+checked+'>Advanced</label></div></div></div>';
               		    
			        
                for (var prop in json_store.collections[colid]) {
                    if (json_store.collections[colid].hasOwnProperty(prop)) {
                         if (!(prop == "name" || prop == "children" || prop == "icon" || prop == "mode")) {
                             html +=  '<div class="form-group"><label for="col_'+prop+'+" class="control-label col-sm-2">'+prop+'</label><div class="col-sm-10">';
                             html += '<input type="text" class="form-control" id="col_'+prop+'" name="c'+prop+'" value="'+json_store.collections[colid][prop]+'" readonly></div></div>';
                         }
                    }                    
                }
                html += "</form>";		

                
                //html += JSON.stringify(json_store.collections[colid]);
                $('#devModal').find('.modal-body').html(html);
                //	- simple/advanced mode
	            //- change collection group (ie move icon to a different page)
	            //- change name
                //create footer buttons
	            $('#devModal').find('.modal-footer').html('<button type="button" class="btn btn-default" data-dismiss="modal">Cancel</button>');  
		        $('#devModal').find('.modal-footer').prepend('<button type="button" class="btn disabled btn-success btn-dev-apply">Apply</button>');      	
		        $('#devModal').find('.modal-footer').prepend('<button type="button" class="btn disabled btn-danger btn-dev-write pull-left">Write to MH</button>');      	
                $('.selectpicker').selectpicker({
                    iconBase: 'fa',
                    tickIcon: 'fa-check'
                });

	            if (dev_changes !== 0) {			
                    $('.btn-dev-apply').removeClass('disabled');
                    $('.btn-dev-write').removeClass('disabled');
                }

				$('#devModal').modal({
					show: true
					});
            }
        }
    });
	
	// if any items present, then create modals and activate updateItem...
	if (items !== "") {
		items = items.slice(0,-1); //remove last comma
        $('.btn-state-cmd').click( function () {			
            var entity = $(this).attr("entity");
            if (json_store.ia7_config.objects !== undefined && json_store.ia7_config.objects[entity] !== undefined) {
                if (json_store.ia7_config.objects[entity].direct_control !== undefined && json_store.ia7_config.objects[entity].direct_control == "yes") {
                    var new_state = "";
                    var possible_states = 0;
                    for (var i = 0; i < json_store.objects[entity].states.length; i++){
                        if (filterSubstate(json_store.objects[entity].states[i]) == 1) continue;
                        possible_states++;
                        if (json_store.objects[entity].states[i] !== json_store.objects[entity].state) new_state = json_store.objects[entity].states[i];

                    }
                    if ((possible_states > 2) || (new_state == "")) alert("Check configuration of "+entity+". "+possible_states+" states detected for direct control object. State is "+new_state);
                    url= '/SET;none?select_item='+entity+'&select_state='+new_state;
                    $.get( url);
                } else {
                    create_state_modal(entity);
                }
            }
            else {
                create_state_modal(entity);
            }
        });
        
        $(".btn-state-cmd").mayTriggerLongClicks().on( 'longClick', function() {		
            var entity = $(this).attr("entity");
            create_state_modal(entity);
        });						
			
		$('.btn-resp-modal').click( function () {			
			var url = $(this).attr('href');
			alert("resp-model. opening url="+url);
			$.get( url, function(data) {
				var start = data.toLowerCase().indexOf('<body>') + 6;
				var end = data.toLowerCase().indexOf('</body>');
				$('#lastResponse').find('.modal-body').html(data.substring(start, end));
				$('#lastResponse').modal({
					show: true
				});
			});
		});	
			
// test multiple items at some point
		updateItem(items);
	}	
	
};

//Constructs a link, likely should be replaced by HashToURL
function buildLink (link, collection_keys){
	if (link === undefined) {
		link = "#";
	} 
	else if (link.indexOf("#") === -1){
		link = "#_request=page&link="+link+"&";
	}
	else {
		link += "&";
	}
	link += "_collection_key="+ collection_keys;
	return link;
}

//Called froms static pages. Grabs collection key from URL to modify static href="/ia7" links
function fixIA7Nav() {

	var url = $(location).attr('href');
	var collid = url.split("_collection_key=");
	$('a').each(function() {
	    if (($(this).attr('href') !== undefined) && ($(this).attr('href').match("^/ia7/"))) {
  			this.href += '&_collection_key='+collid[1]+',';
  		}
	});
}

//Outputs a constantly updating print log
var print_log = function(type,time) {

	var URLHash = URLToHash();
	if (typeof time === 'undefined'){
		$('#list_content').html("<div id='print_log' class='row top-buffer'>");
		$('#print_log').append("<div id='row_log' class='col-sm-12 col-sm-offset-0 col-md-10 col-md-offset-1 col-lg-8 col-lg-offset-2'>");
		$('#row_log').append("<ul id='list'></ul>");
		time = 0;
	}
	URLHash.time = time;
	URLHash.long_poll = 'true';
	if (updateSocket !== undefined && updateSocket.readyState != 4){
		// Only allow one update thread to run at once
		updateSocket.abort();
	}
	var split_path = HashtoJSONArgs(URLHash).split("?");
	var path_str = split_path[0];
	if (type == "speak") path_str = "/print_speaklog";
	var arg_str = split_path[1];	
	updateSocket = $.ajax({
		type: "GET",
		url: "/LONG_POLL?json('GET','"+path_str+"','"+arg_str+"')",
		dataType: "json",
		success: function( json, statusText, jqXHR ) {
			var requestTime = time;
			if (jqXHR.status == 200) {
				JSONStore(json);
				for (var i = (json.data.length-1); i >= 0; i--){
					var line = String(json.data[i]);
					line = line.replace(/\n/g,"<br>");
					if (line) $('#list').prepend("<li style='font-family:courier, monospace;white-space:pre-wrap;font-size:small;position:relative;'>"+line+"</li>");
				}
				requestTime = json.meta.time;
			}
			if (jqXHR.status == 200 || jqXHR.status == 204) {
				//Call update again, if page is still here
				//KRK best way to handle this is likely to check the URL hash
				if ($('#row_log').length !== 0){
					//If the print log page is still active request more data
					print_log(type,requestTime);
				}
			}		
		}
	});
};

var something_went_wrong = function(module,text) {

    if ((json_store.ia7_config.prefs.show_errors !== undefined) &&  json_store.ia7_config.prefs.show_errors == "yes") {

       var type = "danger";
       var mobile = "";
       if ($(window).width() <= 768) { // override the responsive mobile top-buffer
           mobile = "mobile-alert";
       }
       var html = "<div class='alert-err alert "+mobile+" alert-" + type + " fade in' data-alert>";
       html += "<button type='button' class='close' data-dismiss='alert'>x</button>";
       html += "<div class=''>";
       html += "<i class='fa fa-exclamation-triangle icon-larger fa-2x fa-fw pull-left'></i>";
       html += "<div class='sww-text'>";
       html += "<h3 class='sww-text-msg'>ERROR</h3>" + module + " : " + text + " </div></div></div>";
    
       $("#alert-area").prepend($(html));
       
    } else {
    
        console.log("Something went Wrong: "+module+" : " + text);
    }
	
}

var get_stats = function(tagline) {
	var URLHash = URLToHash();

	$.ajax({
		type: "GET",
		url: "/json/misc",
		dataType: "json",
		success: function( json, statusText, jqXHR  ) {
			if (jqXHR.status == 200) {
			    $('.tagline').text(json.data.tagline);
			    var load_avg = "";
			    if (json.data.cores !== undefined && json.data.cores !== null) {
			        var loads = json.data.load.split(" ");
			        for (var i = 0; i < loads.length; i++) {
			            var load = parseFloat(loads[i]) / json.data.cores;
			            if (load < 1) {
			                load_avg += "<span class='text-success'>";
			            } else if (load < 2) {
			                load_avg += "<span class='text-warning'>";
			            } else {
			            	load_avg += "<span class='text-danger'>";
                        }
                        load_avg += loads[i]+" </span>";
                        
			        }
			    } else {
			        load_avg = json.data.load;
			    }
			    if (json.data.uptime) {
			        var server_time = json.data.time.split(':'); //split off seconds since we don't update every second
			        $('.uptime').html(server_time[0]+":"+server_time[1]+" Up "+json.data.uptime+", "+json.data.users+" users, load averages: "+load_avg);
			    } else {
			        $('.uptime').html("System uptime data not available");
			    }
			    $('.counter').text("Site views: "+json.data.web_counter_session+"/"+json.data.web_counter_total);

                if (json_store.ia7_config == undefined) {
                    $('.mh-wi-text').hide();
                    $('.mh-wi-icon').hide(); 
                }      

                if ((json.data.tempoutdoor !== undefined && json.data.tempoutdoor !== null) && (json.data.weather_enabled !== undefined && json.data.weather_enabled == 1)) {
                    $('.mh-wi-text').html("&nbsp;"+json.data.tempoutdoor+"&deg;&nbsp;");
                    $('.mh-wi-icon').removeClass(function (index, classname) {
                        return (classname.match (/(^|\s)wi-\S+/g) || []).join(' ');
                    });
                    var raining = 0;
                    var snowing = 0;
                    var night = 0;
                    if (json.data.raining !== undefined && json.data.raining ) raining = 1;
                    if (json.data.snowing !== undefined && json.data.snowing) snowing = 1;
                    if (json.data.night !== undefined && json.data.night) night = 1;			        
                    if (json.data.clouds !== undefined) {
                        $('.mh-wi-icon').addClass(get_wi_icon(json.data.clouds,raining,snowing,night));
                    } else {
                         $('.mh-wi-icon').addClass("wi-na");

                    }
                }
                
                $('.mh-wi').click( function () {
                    var summary = "<strong>Summary:</strong>&nbsp;&nbsp;"+json.data.summary_long+"<br>";
                    summary += "<strong>Last Updated:</strong>&nbsp;&nbsp;"+json.data.weather_lastupdated;
                    if ($('.mh-wi-icon').hasClass("wi-na")) {
                        summary += "<br><strong>Clouds:</strong>&nbsp;&nbsp"+json.data.clouds;
                    }
                	$('#lastResponse').find('.modal-body').html(summary);
					$('#lastResponse').modal({
						    show: true
					});
                });
                
		    }
		    if (jqXHR.status == 200 || jqXHR.status == 204) {
				stats_loop = setTimeout(function(){
					    get_stats();
					}, stat_refresh * 1000);			}
		}
	});
}

var get_wi_icon = function (conditions,rain,snow,night) {

    var icon = "wi-";
    
    if (night) {
        icon += "night-";
    } else {
        icon += "day-";
    }

    if (conditions == "overcast") {
        icon = "wi-cloudy";       
        if (rain) icon = "wi-rain";
        if (snow) icon = "wi-snow";
 
    } else if (conditions == "rain") {
            icon += "rain";
     
    } else if (conditions == "snow") {
            icon += "snow";     
        
    } else if (conditions == "sky clear" || conditions == "" || conditions == "clear") {
        if (night) {
            icon = "wi-night-clear";
        } else {
            icon = "wi-day-sunny";
        }
        
    } else if (conditions.includes("thunderstorm")) {
        icon = "wi-thunderstorm";
        
    } else if (conditions.includes("mist") || conditions.includes("fog")) {
        icon += "fog";  

    } else if (conditions.includes("breezy")) {
        if (conditions.includes("cloud")) {
            if (night) {
                icon = "wi-night-cloudy-windy"
            } else {
                icon = "wi-day-cloudy-gusts";
            }
        } else if (conditions.includes("overcast")) {
            icon = "wi-cloudy-gusts";
        } else {
            if (night) {
                icon = "wi-strong-wind"
            } else {
                icon = "wi-day-windy";
            }
        }
                
    } else if (conditions.includes("clouds") || conditions.includes("cloudy") || conditions.includes("partly sunny")) {
        if (rain) {
            icon += "rain";
        } else if (snow) {
            icon += "snow";
        } else {
            icon += "cloudy";
        }     
            
    } else {
        icon = "wi-na";
    }
    return icon;
}


var get_notifications = function(time) {
	if (time === undefined) time = new Date().getTime();
	if (updateSocketN !== undefined && updateSocketN.readyState != 4){
		// Only allow one update thread to run at once
		console.log ("Notify aborted "+updateSocketN.readyState);
		updateSocketN.abort();
	}
	var arg_str = "long_poll=true&time="+time;	
	var path_str = "/notifications";
	updateSocketN = $.ajax({
		type: "GET",
		url: "/LONG_POLL?json('GET','"+path_str+"','"+arg_str+"')",		
		dataType: "json",
		success: function( json, statusText, jqXHR ) {
			var requestTime = time;	
			if (jqXHR.status == 200) {
				if (json.data !== undefined) {
					for (var i = 0; i < json.data.length; i++){
						var url = String(json.data[i].url);
						var mode = String(json.data[i].mode);
						var text = String(json.data[i].text);
						var type = String(json.data[i].type);
						var color = String(json.data[i].color);
                        var close = "";
                        var alert_class = "alert-message";
                        if (json.data[i].persistent !== undefined && json.data[i].persistent == "yes") {
                            close = "<button type='button' class='close' data-dismiss='alert'>x</button>";
                            alert_class = "alert-message-persist";
                        }
						if ((type == "sound" ) || ((type == "speech") && (speech_sound == "yes"))) {
							if (url !== "undefined") {
							    audio_play(document.getElementById('sound_element'),url);
							}	
						}
						if (type == "banner" || ((type == "speech") && (speech_banner == "yes"))) {
							var alert_type = "info";
							if (color !== "undefined") {
								if (color == "green") {
									alert_type = "success";
								} else if (color == "red") {
									alert_type = "danger";
								} else if (color == "yellow") {
									alert_type = "warning";
								}
							}
							var mobile = "";
							if ($(window).width() <= 768) { // override the responsive mobile top-buffer
							  mobile = "mobile-alert";
							}

							$("#alert-area").append($("<div class='"+alert_class+" alert alerts "+mobile+" alert-" + alert_type + " fade in' data-alert>"+close+"<p><i class='fa fa-info-circle'></i><strong>  Notification:</strong> " + text + " </p></div>"));
							if (json.data[i].persistent == undefined || (json.data[i].persistent !== undefined && json.data[i].persistent == "no")) {
   	 						    $(".alert-message").delay(4000).fadeOut("slow", function () { $(this).remove(); });
   	 						}
						}
						if (type == "alert") {
							jAlert(text,'MH Notifications');
						}
					}
				}
				requestTime = json.meta.time;				
			}
			if (jqXHR.status == 200 || jqXHR.status == 204) {
					get_notifications(requestTime);
				}
		}
	});
};

var mobile_device = function() {
	//placeholder to turn on webaudio in the future
	var device = "no";
	if (navigator.userAgent.match(/(iPod|iPhone|iPad)/))
		device = "ios";
	if (navigator.userAgent.match(/Android/))
		device = "android";
	return device;
}

function audio_play(audioElement,srcUrl)
{
  audioElement.pause();
  audioElement.src=''; //force playback to stop and quit buffering. Not sure if this is strictly necessary.
  $("#sound_element2").attr("src", srcUrl);  //needed for mobile
  audioElement.src=srcUrl;
  audioElement.currentSrc=srcUrl;
  audioElement.load();
  playWhenReady();
}

function playWhenReady()
{//wait for media element to be ready, then play
  audioElement=document.getElementById('sound_element');
  var audioReady=audioElement.readyState;
  if(audioReady>2) {
    audioElement.play();
  } else if(audioElement.error) {
      var errorText=['(no error)','User interrupted download','Network error caused interruption','Miscellaneous problem with media data','Cannot actually decode this media'];
      console.log("Something went wrong!\n"+errorText[audioElement.error.code]);
      something_went_wrong("audio","audioElement.error");
  } else { //check for media ready again in half a second
      setTimeout(playWhenReady,500);
  }
}

//Creates a table based on the $json_table data structure. desktop & mobile design
var display_table = function(table,records,time) {

	var URLHash = URLToHash();
	if (typeof time === 'undefined'){
		$('#list_content').html("<div id='display_table' class='row top-buffer'>");
		$('#display_table').append("<div id='rtable' class='col-sm-12 col-sm-offset-0 col-md-10 col-md-offset-1 col-lg-8 col-lg-offset-2 col-xs-11 col-xs-offset-0'>");
		time = 0;
	}
	URLHash.time = time;
	URLHash.long_poll = 'true';
	if (updateSocket !== undefined && updateSocket.readyState != 4){
		// Only allow one update thread to run at once
		updateSocket.abort();
	}	
	var path_str = "/table_data"  
	var arg_records = "";
	var page_size;
	if (records !== undefined) arg_records = "&records="+records;
	var arg_str = "var="+table+arg_records+"&start=0&long_poll=true&time="+time;
	updateSocket = $.ajax({
		type: "GET",
		url: "/LONG_POLL?json('GET','"+path_str+"','"+arg_str+"')",
		dataType: "json",
		success: function( json, statusText, jqXHR ) {
			var requestTime = time;
			if (jqXHR.status == 200) {
				JSONStore(json);
				// HP should probably use jquery, but couldn't get sequencing right.
				// HP jquery would allow selected values to be replaced in the future.
				var html = "<table class='table table-curved'><thead><tr>";
				for (var i = 0; i < json.data.head.length; i++){
					var head = String(json.data.head[i]);
					html += "<th>"+head+"</th>";
				}
				html += "</tr></thead><tbody>";
				if (json.data.data !== undefined) {  //If no data, at least show the header
					for (var i = 0; i < json.data.data.length; i++){
						page_size = json.data.page_size + (json.data.page_size * json.data.page);
						if (json.data.page !== undefined && page_size < i &&
						    json_store.ia7_config.prefs.enable_data_table_more !== undefined && 
					        json_store.ia7_config.prefs.enable_data_table_more === "yes") {
							continue;
						}
						html +="<tr>";
						for (var j = 0; j < json.data.data[i].length; j++){
					   		var line = String(json.data.data[i][j]);
					  		html += "<td data-title='"+json.data.head[j]+"'>"+line+"</td>";
							}
						html += "</tr>";
					}
				}
				html += "</tbody></table></div>";
				requestTime = json.meta.time;
				$('#rtable').html(html);
				if (json_store.ia7_config.prefs.enable_data_table_more !== undefined && json_store.ia7_config.prefs.enable_data_table_more === "yes") {
					if (json.data.hook !== undefined && $('#more_row').length === 0) { //there is an option to pull more data
						$('#display_table').append("<div id='more_row' class='col-sm-12 col-sm-offset-0 col-md-10 col-md-offset-1 col-lg-8 col-lg-offset-2 col-xs-11 col-xs-offset-0'>");
						$('#more_row').append('<div class="table_more"><button class="btn btn-default toolbar-right-end right-end pull-right table_btn_more" type="button">');
						$('.table_btn_more').append('next  <i class="fa fa-caret-right"></i>');
					
						$('.table_btn_more').click('on', function () {
							var new_page_size = json.data.page_size + (json.data.page_size * (json.data.page + 1));
							display_table(table,new_page_size,requestTime);
						});
					}
				}

			}
			if (jqXHR.status == 200 || jqXHR.status == 204) {
				//Call update again, if page is still here
				//KRK best way to handle this is likely to check the URL hash
				if ($('#display_table').length !== 0){
					//If the display table page is still active request more data
					display_table(table,page_size,requestTime);
				}
			}		
		}
	});
};


var graph_rrd = function(start,group,time) {

	var URLHash = URLToHash();
	var new_data = 1;
	var data_timeout = 0;
	var refresh = 60; //refresh data every 60 seconds by default

	if (json_store.ia7_config.prefs.rrd_refresh !== undefined) refresh = json_store.ia7_config.prefs.rrd_refresh;

	if (typeof time === 'undefined'){
		$('#list_content').html("<div id='top-graph' class='row top-buffer'>");
		$('#top-graph').append("<div id='rrd-periods' class='row'>");
		$('#top-graph').append("<div id='rrd-graph' class='col-sm-12 col-sm-offset-0 col-md-10 col-md-offset-1 col-lg-8 col-lg-offset-2 col-xs-11 col-xs-offset-0'>");
		$('#top-graph').append("<div id='rrd-legend' class='rrd-legend-class'><br>");
        new_data = 0;
		time = 0;
		clearTimeout(rrd_refresh_loop); //prevent any previous loops from updating.
	}

	if (json_store.ia7_config.prefs.rrd_graph_refresh !== undefined) refresh = json_store.ia7_config.prefs.rrd_graph_refresh;
	
	URLHash.time = time;
	URLHash.long_poll = 'true';
	if (updateSocket !== undefined && updateSocket.readyState != 4){
		// Only allow one update thread to run at once
		updateSocket.abort();
	}	
	var path_str = "/rrd"  
	//if the group has a dot, then it is a separate source
	var source = "&group="+group;
	if (group.indexOf(".") !== -1) {
	    var rrd_source = group.split(".");
	    source = "&source="+rrd_source[0]+"&group="+rrd_source[1];
	}
	var arg_str = "start="+start+source+"&time="+time;
	updateSocket = $.ajax({
		type: "GET",
		//url: "/LONG_POLL?json('GET','"+path_str+"','"+arg_str+"')",
		url: "/json"+path_str+"?"+arg_str,		
		dataType: "json",
		success: function( json, statusText, jqXHR ) {
			var requestTime = time;
			if (jqXHR.status == 200) {
				// HP should probably use jquery, but couldn't get sequencing right.
				// HP jquery would allow selected values to be replaced in the future.

				if (json.data.data !== undefined) {  //If no data, at least show the header and an error
				    data_timeout++;
				    //sometimes the first call for data doesn't return anything. Try a few times.
				    if (data_timeout > 3) {
                        something_went_wrong('RRD','No Data Returned by MH Json Server');
                        return;
                    }
				}	
				JSONStore(json);
				var dropdown_html = '<div class="dropdown"><button class="btn btn-default rrd-period-dropdown" data-target="#" type="button" data-toggle="dropdown">';
				var dropdown_html_list = "";
				var dropdown_current = "Unknown  ";

				$.each(json.data.periods, function(key, value) {
    				if (start === value.split(",")[1]) {
    					dropdown_current = value.split(",")[0]+"  ";
    				}
    				dropdown_html_list += '<li><a href="javascript: void(0)" id="rrdperiod_'+key+'" ';
    				dropdown_html_list += '>'+value.split(",")[0]+'</a></li>';
				});
				
				dropdown_html += '<span class="rrd-current"></span><span class="caret"></span></button><ul class="dropdown-menu">';
    
				dropdown_html += dropdown_html_list;
				dropdown_html += '</ul></div>';
				if (new_data == 0) {
				    $('#rrd-periods').append(dropdown_html);
				    				//sort the legend
				    json.data.data.sort(function(a, b){
    				    if(a.label < b.label) return -1;
    				    if(a.label > b.label) return 1;
    				    return 0;
				    })
				    					// put the selection list on the side.
				    for (var i = 0; i < json.data.data.length; i++){
					    var legli = $('<li style="list-style:none;"/>').appendTo('#rrd-legend');
					    $('<input name="' + json.data.data[i].label + '" id="' + json.data.data[i].label + '" type="checkbox" checked="checked" />').appendTo(legli);
					    $('<label>', {
						    class: "rrd-legend-class",
						    text: json.data.data[i].label,
				    	    'for': json.data.data[i].label
						    }).appendTo(legli);
				    }
				}
				$('.dropdown').find('.rrd-current').text(dropdown_current);
				
				var last_timestamp = "unavailable";
				if (json.data.last_update !== undefined) {
					last_timestamp = new Date(json.data.last_update);
				}
				//Update the footer database updated time
				if ($('#top-graph').length !== 0){
				    $('#Last_updated').remove();		
				    $('#footer_stuff').prepend("<div id='Last_updated'>RRD Database Last Updated:"+last_timestamp+"</div>");
				}

				$('.dropdown').on('click', '.dropdown-menu li a', function(e){
					e.stopPropagation();
    				var period = $(this).attr("id").match(/rrdperiod_(.*)/)[1]; 
    				var new_start = json.data.periods[period].split(',')[1];
					$('.open').removeClass('open');
					clearTimeout(rrd_refresh_loop); //stop the old refresh since we have a new time period
					graph_rrd(new_start,group,0);
				});
 
				function plotAccordingToChoices() {
    				var data = [];

    				$('#rrd-legend').find("input:checked").each(function() {
        				var key = this.name;
        				for (var i = 0; i < json.data.data.length; i++) {
            				if (json.data.data[i].label === key) {
                			data.push(json.data.data[i]);
                			return true;
           		 			}
       		 			}
    				});
    				$.plot($("#rrd-graph"), data, json.data.options);
    				$('.legend').hide();	
				}
		
				window.onresize = function(){
    				var base_width = $(window).width();
   					//if (base_width > 990) base_width = 990;
   					// styling changes @992, so then add a 30 right and left margin
   					var graph_width = base_width - 200; //give some room for the legend
					if (base_width < 701) {
						//put legend below graph
						graph_width=base_width; // - 10;
					} 
    				$('#rrd-graph').css("width",graph_width+"px");
    				$('#rrd-graph').text(''); 
    				$('#rrd-graph').show(); //check
    				plotAccordingToChoices();

				}

				var previousPoint = null;

				$("#rrd-graph").bind("plothover", function(event, pos, item) {
    				$("#x").text(pos.x.toFixed(2));
    				$("#y").text(pos.y.toFixed(2));
    				if (item) {
        				if (previousPoint != item.datapoint) {
            			previousPoint = item.datapoint;
            			$("#tooltip").remove();
            			var x = item.datapoint[0].toFixed(2),
                		y = item.datapoint[1].toFixed(2);
						var date = new Date(parseInt(x));
						var date_str = date.toString(); //split("GMT")[0];
						var nice_date = date_str.split(" GMT")[0];
            			showTooltip(item.pageX, item.pageY, item.series.label + " " + y + "<br>" + nice_date);
        				}
    				} else {
        				$("#tooltip").remove();
        				previousPoint = null;
    				}
				});

				function showTooltip(x, y, contents) {
    				$('<div id="tooltip">' + contents + '</div>').css({
        				position: 'absolute',
        				display: 'none',
        				top: y + 5,
        				left: x + 15,
        				border: '1px solid #fdd',
        				padding: '2px',
        				backgroundColor: '#fee',
        				opacity: 0.80
    				}).appendTo("body").fadeIn(200);
				}

				window.onresize(); // get all settings based on current window size
				plotAccordingToChoices();

				$('#rrd-legend').find("input").change(plotAccordingToChoices);		

				$('.legendColorBox > div > div').each(function(i){
					var color = $(this).css("border-left-color");
					if (new_data == 0) {
    				    $('#rrd-legend').find("li").eq(i).prepend('<span style="width:4px;height:4px;border: 0px;background: '+color+';">&nbsp;&nbsp;&nbsp;</span>&nbsp');
    				}
				});
				requestTime = json.meta.time;

			}
			if (jqXHR.status == 200 || jqXHR.status == 204) {
				//Call update again, if page is still here
				//KRK best way to handle this is likely to check the URL hash
				if ($('#top-graph').length !== 0){

					//If the graph  page is still active request more data
					//Just manually pull a refresh since json_server constantly polling RRD data is a performance problem
					
					rrd_refresh_loop = setTimeout(function(){
					    graph_rrd(start,group,0);
					}, refresh * 1000);
				}
			}		
		}
	});
};

var object_history = function(items,start,days,time) {

	var URLHash = URLToHash();
	var graph = 0;
	var data_timeout = 0;
	if (developer == true) graph = 1;  //right now only show the graph if in developer mode
	if (typeof time === 'undefined'){
		if (graph) {
			$('#list_content').html("<div id='top-graph' class='row top-buffer'>");
			$('#top-graph').append("<div id='hist-periods' class='row'>");		
			$('#top-graph').append("<div id='hist-graph' class='col-sm-12 col-sm-offset-0 col-md-10 col-md-offset-1 col-lg-8 col-lg-offset-2 col-xs-11 col-xs-offset-0'>");
			$('#top-graph').append("<div id='hist-legend' class='rrd-legend-class'><br>");
		} else {
			$('#list_content').html("<div id='hist-table' class='row top-buffer'>");
			$('#hist-table').append("<div id='hist-periods' class='row'>");					
			$('#hist-table').append("<div id='rtable' class='hist-table-margin col-sm-12 col-sm-offset-0 col-md-10 col-md-offset-1 col-lg-8 col-lg-offset-2 col-xs-11 col-xs-offset-0'>");
		}
		time = 0;
	}
		
	URLHash.time = time;
	URLHash.long_poll = 'true';
	if (updateSocket !== undefined && updateSocket.readyState != 4){
		// Only allow one update thread to run at once
		updateSocket.abort();
	}	
	var path_str = "/history"  
	arg_str = "&items="+items+"&days="+days+"&graph="+graph+"&time="+time;
	if (start !== undefined) arg_str += "&start="+start;
	updateSocket = $.ajax({
		type: "GET",
		//url: "/LONG_POLL?json('GET','"+path_str+"','"+arg_str+"')",
		url: "/json"+path_str+"?"+arg_str,		
		dataType: "json",
		success: function( json, statusText, jqXHR ) {
			var requestTime = time;
			if (jqXHR.status == 200) {
				JSONStore(json);
				// HP should probably use jquery, but couldn't get sequencing right.
				// HP jquery would allow selected values to be replaced in the future.

				if (json.data.data !== undefined) {  //If no data, at least show the header and an error
					data_timeout++;
				    //sometimes the first call for data doesn't return anything. Try a few times.
				    if (data_timeout > 3) {
                        something_went_wrong('Object_History','No Data Returned by MH Json Server');
                        return;
                    }
				}	
				if (start == undefined) {
					start = new Date().getTime();
				} else {
					start = start * 1000; //js works in ms
				}
				if (days == undefined) days = 0;
				var end = start - (days * 24 * 60 * 60 * 1000);
				var start_date = new Date(start);
				var end_date = new Date(end);
				
//				var start_value = (start_date.getMonth() + 1)+"/"+start_date.getDate()+"/"+start_date.getFullYear();
//				var end_value = (end_date.getMonth() + 1)+"/"+end_date.getDate()+"/"+end_date.getFullYear();
				var start_value = start_date.getFullYear()+"-"+(start_date.getMonth() + 1)+"-"+start_date.getDate();
				var end_value = end_date.getFullYear()+"-"+(end_date.getMonth() + 1)+"-"+end_date.getDate();
								
				var datepicker_html = '<div class="input-group input-daterange" id="datepicker">';
    			datepicker_html += '<input type="text" class="form-control hist_end" value="'+end_value+'">';
    			datepicker_html += '<span class="input-group-addon">to</span>';
   				datepicker_html += '<input type="text" class="form-control hist_start" value="'+start_value+'">';
   				datepicker_html += '<span class="input-group-btn"><button type="button" class="btn btn-default update_history">Update</button></span></div>';
				$('#hist-periods').append('<div id="row0" class="hist-datepicker col-sm-12 col-sm-offset-0 col-md-10 col-md-offset-1 col-lg-8 col-lg-offset-2">'+datepicker_html+'</div>');
				//$('.input-daterange input').each(function() {
    			//	$(this).datepicker();
				//});
				$('#datepicker').datepicker({
					format: "yyyy-m-d"
				});
				
				$('.update_history').click(function() {
					var new_start = new Date($('.hist_start').val().replace(/-/g, "/")).getTime();
					var new_end = new Date($('.hist_end').val().replace(/-/g, "/")).getTime();					
					var end_days = (new_start - new_end) / (24 * 60 * 60 * 1000)
					new_start = new_start / 1000;
					object_history(items,new_start,end_days);
				});
				// graphing view
				if (graph) {
					//sort the legend
					json.data.data.sort(function(a, b){
    					if(a.label < b.label) return -1;
    					if(a.label > b.label) return 1;
    					return 0;
					})
					// put the selection list on the side.
					for (var i = 0; i < json.data.data.length; i++){
						var legli = $('<li style="list-style:none;"/>').appendTo('#hist-legend');
						$('<input name="' + json.data.data[i].label + '" id="' + json.data.data[i].label + '" type="checkbox" checked="checked" />').appendTo(legli);
						$('<label>', {
							class: "rrd-legend-class",
							text: json.data.data[i].label,
				    		'for': json.data.data[i].label
							}).appendTo(legli);
					}
					function plotAccordingToChoices() {
    					var data = [];

    					$('#hist-legend').find("input:checked").each(function() {
        					var key = this.name;
        					for (var i = 0; i < json.data.data.length; i++) {
            					if (json.data.data[i].label == key) {
                					data.push(json.data.data[i]);
                					return true;
           		 				}
       		 				}
    					});
    					// take away the border so that it looks better and span the graph from start to end.
    					json.data.options.grid.borderWidth = 0;

						json.data.options.xaxis.min = new Date($('.hist_end').val().split('-')).getTime();
 						json.data.options.xaxis.max = new Date($('.hist_start').val().split('-')).getTime() + (24 * 60 * 60 * 1000);
                		
    					$.plot($("#hist-graph"), data, json.data.options);
    					$('.legend').hide();	
					}
		
					window.onresize = function(){
    					var base_width = $(window).width();
   						//if (base_width > 990) base_width = 990;
   						// styling changes @992, so then add a 30 right and left margin
   						var graph_width = base_width - 200; //give some room for the legend
						if (base_width < 701) {
							//put legend below graph
							graph_width=base_width; // - 10;
						} 
    					$('#hist-graph').css("width",graph_width+"px");
    					$('#hist-graph').text(''); 
    					$('#hist-graph').show(); //check
    					plotAccordingToChoices();

					}

					var previousPoint = null;

					$("#hist-graph").bind("plothover", function(event, pos, item) {
    					$("#x").text(pos.x.toFixed(2));
    					$("#y").text(pos.y.toFixed(2));
    					if (item) {
        					if (previousPoint != item.datapoint) {
            				previousPoint = item.datapoint;
            				$("#tooltip").remove();
            				var x = item.datapoint[0].toFixed(2),
                			y = item.datapoint[1].toFixed(2);
							var date = new Date(parseInt(x));
							var date_str = date.toString(); //split("GMT")[0];
							var nice_date = date_str.split(" GMT")[0];
            				showTooltip(item.pageX, item.pageY, item.series.label + " " + y + "<br>" + nice_date);
        					}
    					} else {
        					$("#tooltip").remove();
        					previousPoint = null;
    					}	
					});

					function showTooltip(x, y, contents) {
    					$('<div id="tooltip">' + contents + '</div>').css({
        					position: 'absolute',
        					display: 'none',
        					top: y + 5,
        					left: x + 15,
        					border: '1px solid #fdd',
        					padding: '2px',
        					backgroundColor: '#fee',
        					opacity: 0.80
    					}).appendTo("body").fadeIn(200);
					}

					window.onresize(); // get all settings based on current window size
					plotAccordingToChoices();

					$('#hist-legend').find("input").change(plotAccordingToChoices);		

					$('.legendColorBox > div > div').each(function(i){
						var color = $(this).css("border-left-color");
    					$('#hist-legend').find("li").eq(i).prepend('<span style="width:4px;height:4px;border: 0px;background: '+color+';">&nbsp;&nbsp;&nbsp;</span>&nbsp');
					});
				} else {
					// table
					var html = "<table class='table table-curved'><thead><tr>";
					html += "<th>Time</th><th>State</th><th>Set By</th>";
					html += "</tr></thead><tbody>";
					if (json.data.data !== undefined) {  //If no data, at least show the header
						json.data.data.reverse();
						for (var i = 0; i < json.data.data.length; i++){
							html +="<tr>";
					  		html += "<td data-title='Time'>"+new Date(json.data.data[i][0]).toString().replace(/GMT-\d\d\d\d/,"")+"</td>";
					  		html += "<td data-title='State'>"+String(json.data.data[i][1])+"</td>";
					  		html += "<td data-title='Setby'>"+String(json.data.data[i][2])+"</td>";
							html += "</tr>";
						}
					}
					html += "</tbody></table></div>";
					$('#rtable').html(html);
				}	
				requestTime = json.meta.time;

			}
			if (jqXHR.status == 200 || jqXHR.status == 204) {
				//Call update again, if page is still here
				//KRK best way to handle this is likely to check the URL hash
//TODO live updates

			}		
		}
	});
};



/////////////// Floorplan //////////////////////////////////////////////////////////
var fp_display_width=0; // updated by fp_resize_floorplan_image
var fp_display_height=0; // updated by fp_resize_floorplan_image
var fp_scale = 100; // updated by fp_reposition_entities
var fp_grabbed_entity = null; // store item for drag & drop
var fp_icon_select_item_id = null; // store item id on right click for icon set selection
var fp_icon_image_size = 48;

var noDragDrop = function() {
    return false;
};

var fp_getOrCreateIcon = function (json, entity, i, coords){
    var popover = 0;
    if ((json.data[entity].type === "FPCamera_Item") || (json_store.ia7_config.prefs.fp_state_popovers === "yes"))
        popover = 1;

    var popover_html = "";
    if (popover)
        popover_html = 'data-toggle="popover" data-trigger="focus" tabindex="0"';
    var entityId = 'entity_'+entity+'_'+i;
    if ($('#' + entityId).length === 0) {
        var html = '<span style="display: inline-block">'  + // this span somehow magically make resizing the icons work
                '<a title="'+entity+'"><img '+popover_html+' ' +
                'id="'+entityId+'"' +
                'class="entity='+entityId+' floorplan_item coords='+coords+'" ' +
                'style="display: none" ' +
                '></img></a>'+
                '</span>';
        if (coords !== ""){
            $('#graphic').append(html);
        }
        else {
            $('#fp_positionless_items').append(html);
        }
    }
    var E = $('#'+entityId);
    E.bind("dragstart", noDragDrop);
    var image = get_fp_image(json.data[entity]);
    E.attr('src',"/ia7/graphics/"+image);
    if (developer == true)
        E.css("border","1px solid black");
    return E;
};

var fp_resize_floorplan_image = function(){
    var floor_width = $("#fp_graphic").width();
    //$("#fp_graphic").attr("width", "1px");
    fp_display_width = $("#graphic").width();
    $('#fp_graphic').attr("width",fp_display_width+"px");
    fp_display_height = $("#fp_graphic").height();
};

var fp_reposition_entities = function(){
    var fp_graphic_offset = $("#fp_graphic").offset();
    var width = fp_display_width;
    var hight = fp_display_height;
    var onePercentWidthInPx = width/100;
    var onePercentHeightInPx = hight/100;
    var fp_get_offset_from_location = function(item) {
        var y = item[0];
        var x = item[1];
        var newy = fp_graphic_offset.top +  y * onePercentHeightInPx;
        var newx = fp_graphic_offset.left +  x * onePercentWidthInPx;
        return {
            "top": newy,
            "left": newx
        };
    };

    var nwidth;
//There are 2 sizing jumps in bootstrap.min.css one at 992 and another at 1200
//Scale icons if less than 991
//1-991
//@992 = 821 (171)
//@993 = 822
//@995 = 824
//@994 = 828   (166)
//@1100 = 991 (109)
//@1200 = 790
    if (width < 992) {
    	nwidth = 992;
    } else if (width < 1200) {
    	nwidth = 822;
    } else {
    	nwidth = 790;
    }
    var fp_scale =  width/nwidth;
    var fp_scale_percent = Math.round( fp_scale * 100);
    
    // update the location of all the objects...
    $(".floorplan_item").each(function(index) {
        var classstr = $(this).attr("class");
        var coords = classstr.split(/coords=/)[1];
        $(this).width(fp_scale_percent + "%");

        if (coords.length === 0){
            return;
        }
        var fp_location = coords.split(/x/);
        var fp_offset =  fp_get_offset_from_location(fp_location);

        var element_id = $(this).attr('id');
        var adjust = fp_icon_image_size*fp_scale/2;
        var fp_off_center = {
            "top":  fp_offset.top - adjust,
            "left": fp_offset.left - adjust
        };
        $(this).show();
        fp_set_pos(element_id, fp_off_center);
    });

	$('.icon_select img').each(function(){
        $(this).width(fp_scale_percent + "%");
	});
};

var fp_show_all_icons = function() {

    $(".floorplan_item").each(function(index) {
		$(this).show();
	});
};

var fp_set_pos = function(id, offset){
    var item =  $('#' + id);
    // do not move the span, this make the popup to narrow somehow
    // item.closest("span").offset(offset);
    item.offset(offset);

};

var fp_is_point_on_fp = function (p){
    var offset = $("#fp_graphic").offset();
    var width = $("#fp_graphic").width();
    var height = $("#fp_graphic").height();
    if (p.top < offset.top)
        return false;
    if (p.top > offset.top + height)
        return false;
    if (p.left < offset.left)
        return false;
    if (p.left > offset.left + width)
        return false;

    return true;
};

var floorplan = function(group,time) {
    var URLHash = URLToHash();
    var baseimg_width;
    if (typeof time === 'undefined'){
        //var window_width = $(window).width();
        $('#list_content').html("<div id='floorplan' class='row top-buffer'>");
        if (developer === true){
            // add elememnts to show current position on floorplan
            $('#floorplan').append("<div class='col-sm-12 col-sm-offset-0 col-md-10 col-md-offset-1 col-lg-8 col-lg-offset-2'><ol>" +
                    "<li>grab icon and drop it on apropriate position on the flooplan</li>" +
                    "<li>right click item to select another iconset</li>"+
                    "<li>to remove the item from the perl code drop it besides the fp background image</li>"+
                    "<li>repeat 1/2/3 for all items you'd like to change</li>"+
                    "<li>copy the generated perl code into your usercode file</li>" +
                    "</ol>" +
                    "<center>y,x = <span id='debug_pos'></span>" +
                    "</center></div>");
        }
        $('#floorplan').append("<div id='graphic' class='col-sm-12 col-sm-offset-0 col-md-10 col-md-offset-1 col-lg-8 col-lg-offset-2'>");
        time = 0;
        $('#graphic').prepend('<center><img id="fp_graphic" border="1"  /></center>');
        if (developer === true){
            $('#fp_graphic').css("border","1px solid black");
            $('#list_content').append("<div id='fp_positionless_items' />");
            $('#list_content').append("<pre id='fp_pos_perl_code' />");
        }
        $('#fp_graphic').bind("load", function () {
            fp_resize_floorplan_image();
            floorplan(group, time);
        });
        var base_img_dir = '/ia7/graphics';
		if (json_store.ia7_config.prefs.floorplan_baseimg_dir !== undefined) base_img_dir = json_store.ia7_config.prefs.floorplan_baseimg_dir;
        $('#fp_graphic').attr("src", base_img_dir+'/floorplan-'+group+'.png');
        return;
    }
    if (updateSocket !== undefined && updateSocket.readyState !== 4){
        // Only allow one update thread to run at once
        updateSocket.abort();
    }

    if (developer === true){
        // update positon
        $(document).mousemove(function(e){
            var offset = $("#fp_graphic").offset();
            var width = $("#fp_graphic").width();
            var hight = $("#fp_graphic").height();
            var  l = e.pageX - offset.left;
            var  t = e.pageY - offset.top;

            //var pos =   Math.round((t/hight) *100) +"," + Math.round((l/width)*100);
            var pos =  (t/hight) *100 +"," + (l/width)*100;
            $('#debug_pos').text(pos);
            if (fp_grabbed_entity !== null){
                //var itemCenterOffset = Math.round(fp_grabbed_entity.width/2);
                var itemCenterOffset = fp_grabbed_entity.width/2;
                var newPos = {
                    "top": e.pageY - itemCenterOffset,
                    "left": e.pageX - itemCenterOffset
                };
                fp_set_pos(fp_grabbed_entity.id, newPos);
            }
        });

        $(window).mousedown(function(e){
            if (e.which === 1 && e.target.id.indexOf("entity_") >= 0){
                fp_grabbed_entity = e.target;
                e.stopPropagation();
                return true;
            }
        });

        $(window).mouseup(function(e){
            if (fp_grabbed_entity === null)
                return;

            set_coordinates_from_offset(fp_grabbed_entity.id);
            fp_reposition_entities();
            fp_grabbed_entity = null;
        });

    }

    var set_coordinates_from_offset = function (id)
    {
        var E = $('#'+id);
        var offsetE = E.offset();
        offsetE.top += E.width()/2;
        offsetE.left += E.width()/2;
        var offsetP = $("#fp_graphic").offset();
        var width = fp_display_width;
        var hight = fp_display_height;
        var onePercentWidthInPx = width/100;
        var onePercentHeightInPx = hight/100;

        var newy =  (offsetE.top - offsetP.top) / onePercentHeightInPx;
        var newx =  (offsetE.left - offsetP.left) / onePercentWidthInPx;
        var coords = newy+"x"+newx;
        var name = id.match(/entity_(.*)_(\d)+$/)[1];
        var codeLines = $("#fp_pos_perl_code").text().split('\n');
        var newCode = "";
        if (fp_is_point_on_fp(offsetE) === false){
            E.attr("class", "entity="+id+" floorplan_item coords=");
            E.attr("src", "/ia7/graphics/fp_unknown_info_48.png");
            for (var i = 0; i< codeLines.length; i++)
            {
                var line = codeLines[i];
                if (line.startsWith("$"+name) === false && line !== "")
                {
                    newCode += line + "\n";
                }
            }
        }
        else{
            E.attr("class", "entity="+id+" floorplan_item coords="+coords);
            var coordIdx = id.match(/entity_(.*)_(\d)+$/)[2];

            var itemUpdated = false;
            for (var i = 0; i< codeLines.length; i++)
            {
                var line = codeLines[i];
                if (line.startsWith("$"+name+"->set_fp_location"))
                {
                    var m = line.match(/.*\((.*)\).*/);
                    oldCoords = m[1].split(",");
                    oldCoords[+coordIdx] = newy;
                    oldCoords[+coordIdx+1] = newx;
                    var newline = "$" + name + "->set_fp_location("+ oldCoords.join(",") + ");\n";
                    newCode += newline;
                    itemUpdated = true;
                }
                else if (line !== "")
                {
                    newCode += line + "\n";
                }
            }
            if (itemUpdated === false)
            {
                var newline = "$" + name + "->set_fp_location("+ newy +","+ newx + ");\n";
                newCode += newline;
            }
        }
        newCode = newCode.split('\n').sort().join('\n');
        $("#fp_pos_perl_code").text(newCode);
    };


    // reposition on window size change
    window.onresize = function(){
        if ($('#floorplan').length === 0)
        {
            window.onresize = null;
            return;
        }

        fp_resize_floorplan_image();
        fp_reposition_entities();
    };

    var path_str = "/objects";
    var fields = "fields=fp_location,state,states,fp_icons,schedule,logger_status,fp_icon_set,img,link,label,type";
    if (json_store.ia7_config.prefs.state_log_show === "yes") fields += ",state_log";
    var arg_str = "parents="+group+"&"+fields+"&long_poll=true&time="+time;

    updateSocket = $.ajax({
        type: "GET",
        url: "/LONG_POLL?json('GET','"+path_str+"','"+arg_str+"')",
        dataType: "json",
        error: function(xhr, textStatus, errorThrown){
               console.log('FP: request failed: "' + textStatus + '" "'+JSON.stringify(errorThrown, undefined,2)+'"');
        },
        success: function( json, statusText, jqXHR ) {

            var requestTime = time;
            var last_slider_popover;
            if (jqXHR.status === 200) {
                //var t0 = performance.now();
                JSONStore(json);
                for (var entity in json.data) {
                    if (developer === true && requestTime === 0){
                        perl_pos_coords = "";
                    }
                    for (var i=0 ; i < json.data[entity].fp_location.length-1; i=i+2){ //allow for multiple graphics
                        var popover = 0;
                        if ((json.data[entity].type === "FPCamera_Item") || (json_store.ia7_config.prefs.fp_state_popovers === "yes"))
                            popover = 1;

                        if (developer === true && requestTime === 0){
                            if (perl_pos_coords.length !== 0){
                                perl_pos_coords += ", ";
                            }
                            perl_pos_coords += "" + json.data[entity].fp_location[i]+','+json.data[entity].fp_location[i+1];
                        }

                        var coords= json.data[entity].fp_location[i]+'x'+json.data[entity].fp_location[i+1];
                        var E = fp_getOrCreateIcon(json, entity, i, coords, developer);

                        if (developer === false)
                        {
                            // create unique popovers for Camera items
                            if (json.data[entity].type === "FPCamera_Item") {
                                var name = entity;
                                if (json.data[entity].label !== undefined)
                                    name = json.data[entity].label;

                                var a_start = "";
                                var a_end = "";
                                if (json.data[entity].link !== undefined) {
                                    a_start = '<a href="'+json.data[entity].link+'">';
                                    a_end = '</a>';
                                }

                                $('[data-toggle="popover"]').popover({
                                    placement : 'auto bottom', //placement of the popover. also can use top, bottom, left or right
                                    title : name,
                                    html: 'true', //needed to show html of course
                                    content : '<div id="popOverBox">'+a_start+'<img src="'+json.data[entity].img+'" width="251" height="201" />'+a_end+'</div>'
                                });
                            } else {
                                if (popover) {

                                    $('[data-toggle="popover"]').popover({
                                        placement : 'auto bottom', //placement of the popover. also can use top, bottom, left or right
                                        title : function() {
                                            var fp_entity = $(this).attr("id").match(/entity_(.*)_\d+$/)[1]; //strip out entity_ and ending _X ... item names can have underscores in them.
                                            var name = fp_entity;
                                            if (json_store.objects[fp_entity].label !== undefined) name = json_store.objects[fp_entity].label;
                                            var ackt = E.offset();
                                            return "<span class='entity-name'>"+name+ "</span> - <span class='fp-object-state'>"+json_store.objects[fp_entity].state + "</span>";
                                        },
                                        trigger: 'manual',
                                        html: 'true', //needed to show html of course
                                        content : function() {
                                            var fp_entity = $(this).attr("id").match(/entity_(.*)_\d+$/)[1]; //strip out entity_ and ending _X ... item names can have underscores in them.
                                            var po_states = json_store.objects[fp_entity].states;
                                            var html = '<div id="popOverBox">';
                                            // HP need to have at least 2 states to be a controllable object...
                                            if (!sliderObject(json_store.objects[fp_entity].states) || (json_store.ia7_config.prefs.floorplan_slider !== undefined && json_store.ia7_config.prefs.floorplan_slider == "no")) {		

                                                if (po_states.length > 1) {
                                                    html = '<div class="btn-group stategrp0 btn-block">';
                                                    var buttons = 0;
                                                    var stategrp = 0;
                                                    for (var i = 0; i < po_states.length; i++){
                                                        if (filterSubstate(po_states[i]) !== 1) {
                                                            buttons++;
                                                            if (buttons > 2) {
                                                                stategrp++;
                                                                html += "</div><div class='btn-group btn-block stategrp"+stategrp+"'>";
                                                                buttons = 1;
                                                            }

                                                            var color = getButtonColor(po_states[i]);
                                                            //TODO disabled override
                                                            var disabled = "";
                                                            if (po_states[i] === json_store.objects[fp_entity].state) {
                                                                disabled = "disabled";
                                                            }
                                                            html += "<button class='btn btn-state-cmd col-sm-6 col-xs-6 btn-"+color+" "+disabled+"'";
                                                            var url= '/SET;none?select_item='+fp_entity+'&select_state='+po_states[i];
                                                            html += '">'+po_states[i]+'</button>';
                                                        }
                                                    }
                                                    html += "</div></div>";
                                                    fp_popover_close = true;
                                                }
                                            } else {
                                                html = '<div class="btn-group stategrp0 btn-block">';
                                                //if button doesn't have on and off don't display
                                                if ($.inArray("on", json_store.objects[fp_entity].states) !== -1 && $.inArray("off", json_store.objects[fp_entity].states) !== -1) {
                                                    html += "<button class='btn btn-state-cmd col-sm-6 col-xs-6 btn-success'>on</button>";					                
                                                    html += "<button class='btn btn-state-cmd col-sm-6 col-xs-6 btn-default'>off</button>";
                                                    subbuttons = 1;	
                                                }	
                                                html += "</div>";			                
                                                html += "<div id='sliderFP' class='brightness-slider'></div>";					
                                                html += "<br>";
                                                fp_popover_close = false;
                                            }
                                            return html;
                                        }
                                    }).off().on('click', function (e) {
                                        var src = $(this).attr('id').match(/entity_(.*)_\d+$/)[1];
                                        last_slider_popover = src;
     
                                        var slider_data = sliderDetails(json_store.objects[src].states);		                
                                        var val = $( "a[title='"+src+"']" ).find(".fp-object-state").text().replace(/\%/,'');
              
                                        var position = slider_data.values.indexOf(val);
                                        if (val == "on") position = slider_data.max;
                                        if (val == "off") position = slider_data.min;
                                        if (position == undefined || position < 0) position = 0;
                                        $('#sliderFP' ).slider({
                                            min: slider_data.min,
                                            max: slider_data.max,
                                            value: position
                                        });

                                        if ($(".stategrp0").children().length == 0) {  
                                            $(".stategrp0").remove();
                                        }

                                        $( "a[title='"+src+"']" ).find(".popover-content").popover('show');
                                        
                                        $( "#sliderFP" ).on( "slide", function(event, ui) {
                                            var sliderstate = slider_data.values[ui.value];
                                            if ((sliderstate == "100") && (slider_data.pct)) {
                                                sliderstate = "on";
                                            } else if ((sliderstate == "0") && (slider_data.pct)) {
                                                sliderstate = "off";
                                            } else {
                                                if (slider_data.pct) sliderstate += "%";
                                            }
                                            $('.fp-object-state').text(sliderstate);
                                        });
                                        
                                        $( "#sliderFP" ).on( "slidechange", function(event, ui) {
                                            if ($('#sliderFP').length == 0) return
                                            var fp_entity = $(this).parent().parent().parent().attr("title");//.match(/entity_(.*)_\d+$/)[1];
                                            var sliderstate = slider_data.values[ui.value];
                                            if (isNaN(sliderstate)) {
                                                console.log("Warning: Slider value isn't a number:"+sliderstate);
                                                return; //if there isn't a numeric value then bail out of sending a set comment
                                            }
                                            if ((sliderstate == "100") && (slider_data.pct)) {
                                                sliderstate = "on";
                                            } else if ((sliderstate == "0") && (slider_data.pct)) {
                                                sliderstate = "off";
                                            } else {
                                                if (slider_data.pct) sliderstate += "%";
                                            }
                                            if ($(".entity-name").length == 1) {
                                                url= '/SET;none?select_item='+fp_entity+'&select_state='+sliderstate;
                                                $.get( url);
                                                fp_popover_close = true;
                                                last_slider_popover = fp_entity;
                                                $('.popover').popover('hide');
                                                $('#sliderFP').remove();
                                                $( "a[title='"+fp_entity+"']" ).find('[data-toggle="popover"]').blur();
                                            }
                                        });

                                        $('.btn-state-cmd').on('click', function () {
                                            var fp_entity = $(this).parent().parent().parent().parent().attr("title");//.match(/entity_(.*)_\d+$/)[1];
                                            var url= '/SET;none?select_item='+fp_entity+'&select_state='+$(this).text();
                                            if (!$(this).hasClass("disabled")) $.get( url);
                                            fp_popover_close = true;
                                            $('.popover').popover('hide');
                                            $('#sliderFP').remove();
                                        });
                                    });   
                                        $('[data-toggle="popover"]').on('blur',function(e){
                                            if(fp_popover_close) {
                                                $(this).popover('hide');
                                                $('#sliderFP').remove();
                                            } else {
                                                $(this).focus();
                                                fp_popover_close = false; //true
                                             }
                                        });
                                        $('[data-toggle="popover"]').on("focus",function(){
                                            if (fp_popover_close) $(this).popover('show')

                                        });
                                        $('[data-toggle="popover"]').mayTriggerLongClicks().on('longClick', function() {
                                            $(this).popover('hide');
                                            $('#sliderFP').remove();
                                            var fp_entity = $(this).attr("id").match(/entity_(.*)_\d+$/)[1]; //strip out entity_ and ending _X ... item names can have underscores in them.
                                            create_state_modal(fp_entity);
                                        });
                                } else {
                                    E.click( function () {
                                        var fp_entity = $(this).attr("id").match(/entity_(.*)_\d+$/)[1]; //strip out entity_ and ending _X ... item names can have underscores in them.
                                        create_state_modal(fp_entity);
                                    });
                                }
                                E.mayTriggerLongClicks().on( 'longClick', function() {
                                    var fp_entity = $(this).attr("id").match(/entity_(.*)_\d+$/)[1]; //strip out entity_ and ending _X ... item names can have underscores in them.
                                    create_state_modal(fp_entity);
                                });
                            }
                        }
                    }

                    if (developer === true && requestTime === 0){
                        if (perl_pos_coords.length===0)
                        {
                            fp_getOrCreateIcon(json, entity, 0, "");
                        }
                        else{
                            var oldCode = $('#fp_pos_perl_code').text();
                            if (oldCode.length !== 0)
                                oldCode += "\n";

                            var perl_pos_code = "";
                            var iconset = json.data[entity].fp_icon_set;
                            if (iconset !== undefined){
                                perl_pos_code += '$' + entity + '->set_fp_icon_set("';
                                perl_pos_code += iconset + '");\n';
                            }
                            perl_pos_code += "$" + entity + "->set_fp_location(";
                            perl_pos_code += perl_pos_coords + ");";
                            perl_pos_code = oldCode  + perl_pos_code;
                            perl_pos_code = perl_pos_code.split('\n').sort().join('\n');
                            $('#fp_pos_perl_code').text(perl_pos_code);
                        }
                    }
                }
                //This one makes the proper placement
                //fp_reposition_entities();
                if (requestTime === 0 && developer === true){
                    $('#list_content').append("<p>&nbsp;</p>");
                    $.ajax({
                        type: "GET",
                        url: "/LONG_POLL?json('GET','fp_icon_sets','px=48')",
                        dataType: "json",
                        error: function(xhr, textStatus, errorThrown){
                        },
                        success: function( json, statusText, jqXHR ) {
                            var requestTime = time;
                            if (jqXHR.status === 200) {
                                var iconlist = '<ul class="icon_select" style="display:none;z-index:1000;position:absolute;overflow:hidden;border:1px solid #CCC; background: #FFF; border-radius: 5px; padding: 0;">\n';
                                var pathlist = jqXHR.responseJSON.data;
                                for (var i = 0; i < pathlist.length; i++){
                                    var path = pathlist[i];
                                    iconlist += "<il  style='float:left;padding:1px;cursor:pointer;list-style-type:none;transition:all .3s ease;'>";
                                    iconlist += "<img src='"+path+"' size='"+fp_scale+"%'/></il>\n";
                                }
                                iconlist += "<il  style='float:left;padding:1px;cursor:pointer;list-style-type:none;transition:all .3s ease;'>";
                                iconlist += "</ul>\n";
                                $('#list_content').append(iconlist);

                                // Trigger action when the contexmenu is about to be shown
                                $(".floorplan_item").bind("contextmenu", function (event) {

                                    event.preventDefault();

                                    fp_icon_select_item_id = $(this).attr('id');
                                    $(".icon_select").finish().toggle(100);
                                    $(".icon_select").offset({
                                        top: event.pageY,
                                        left: event.pageX
                                    });
                                });


                                // If the document is clicked somewhere
                                $(document).bind("mousedown", function (e) {
                                    if ($(e.target).parents(".icon_select").length === 0) {
                                        $(".icon_select").hide(100);
                                        fp_icon_select_item_id = null;
                                    }
                                });


                                // If the menu element is clicked
                                $(".icon_select img").click(function(){
                                    var img = $(this).attr("src");
                                    $('#'+fp_icon_select_item_id).attr('src', img);
                                    var name = fp_icon_select_item_id.match(/entity_(.*)_(\d)+$/)[1];

                                    var codeLines = $("#fp_pos_perl_code").text().split('\n');
                                    var newCode = "";

                                    var icon_set_name = img.match(/.*fp_(.*)_(.*)_48.png/)[1];
                                    var itemUpdated = false;
                                    for (var i = 0; i< codeLines.length; i++)
                                    {
                                        var line = codeLines[i];
                                        if (line.startsWith("$"+name+"->set_fp_icon_set"))
                                        {
                                            var newline = "$" + name + '->set_fp_icon_set("'+ icon_set_name+ '");\n';
                                            newCode += newline;
                                            itemUpdated = true;
                                        }
                                        else if (line !== "")
                                        {
                                            newCode += line + "\n";
                                        }
                                    }
                                    if (itemUpdated === false)
                                    {
                                        var newline = "$" + name + '->set_fp_icon_set("'+ icon_set_name +'");\n';
                                        newCode += newline;
                                    }
                                    newCode = newCode.split('\n').sort().join('\n');
                                    $("#fp_pos_perl_code").text(newCode);
                                    $(".icon_select").hide(100);
                                    fp_icon_select_item_id = null;
                                });
                            }
                        }
                    });
                }
                requestTime = json.meta.time;
                //var t1 = performance.now();
            }
            if (jqXHR.status === 200 || jqXHR.status === 204) {
                //Call update again, if page is still here
                //KRK best way to handle this is likely to check the URL hash
                if ($('#floorplan').length !== 0){
                    //If the floorplan page is still active request more data
                    // and we are not editing the fp
                    if (developer ===  false)
                        floorplan(group,requestTime);
                }
            }
            if (time === 0){
                // hack to fix initial positions of the items
                var wait = 400;
                setTimeout(function(){
                    fp_reposition_entities();
                }, wait);
            }            
        }
    });
};

var get_fp_image = function(item,size,orientation) {
  	var image_name;
	var image_color = getButtonColor(item.state);
	var baseimg_width = $(window).width();
  //	if (baseimg_width < 500) fp_icon_image_size = "32" // iphone scaling
	//kvar fp_icon_image_size = "32"
 	if (item.fp_icons !== undefined) {
 		if (item.fp_icons[item.state] !== undefined) return item.fp_icons[item.state];
 	}
 	if (item.fp_icon_set !== undefined) {
		return "fp_"+item.fp_icon_set+"_"+image_color+"_"+fp_icon_image_size+".png";
 	} 	
 	//	if item.fp_icons.return item.fp_icons[state];
	if(item.type === "Light_Item" || item.type === "Fan_Light" ||
		item.type === "Insteon_Device" || item.type === "UPB_Link" ||
		item.type === "Insteon::SwitchLinc" || item.type === "Insteon::SwitchLincRelay" ||
		item.type === "Insteon::KeyPadLinc" ||
		item.type === "EIB_Item" || item.type === "EIB1_Item" ||
		item.type === "EIB2_Item" || item.type === "EIO_Item" ||
		item.type === "UIO_Item" || item.type === "X10_Item" ||
		item.type === "xPL_Plugwise" || item.type === "X10_Appliance") {

			return "fp_light_"+image_color+"_"+fp_icon_image_size+".png";
  	}
  	
	if(item.type === "Motion_Item" || item.type === "X10_Sensor" ||
		item.type === "Insteon::MotionSensor" ) {
			return "fp_motion_"+image_color+"_"+fp_icon_image_size+".png";

  	}
  	
	if(item.type === "Door_Item" || item.type === "Insteon::IOLinc_door") {
			return "fp_door_"+image_color+"_"+fp_icon_image_size+".png";

  	}  	

	if(item.type === "FPCamera_Item" ) {
			return "fp_camera_default_"+fp_icon_image_size+".png";
 		}
  	
	return "fp_unknown_info_"+fp_icon_image_size+".png";
};


var create_state_modal = function(entity) {
		var name = entity;
		if (json_store.objects[entity].label !== undefined) name = json_store.objects[entity].label;
		$('#slider').remove();
//		$('#control').modal('show');

        //make sure the modal is centered on all devices
        $("#control").modal('show').css({
            'margin-left': function () { //Horizontal centering
                var offset = "auto";
                if ($(window).width() < 768) {
                    offset = 0;
                    if (($(window).width() / 2 - 210) > 0) offset = ($(window).width() / 2 - 210);
                }
                return offset;               
             }
        });		
        $( '.modal-backdrop').click(function(){
            $("#control").modal('hide');
        });

		
		var modal_state = json_store.objects[entity].state;
		$('#control').find('.object-title').html(name + " - <span class='object-state'>" + json_store.objects[entity].state + "</span>");
		$('#control').find('.control-dialog').attr("entity", entity);
		var modal_states = json_store.objects[entity].states;
		// HP need to have at least 2 states to be a controllable object...
		if (modal_states == undefined) modal_states = 1;
		if (modal_states.length > 1) {
			$('#control').find('.states').html('<div class="btn-group stategrp0 btn-block"></div>');
			var modal_states = json_store.objects[entity].states;
			var buttonlength = 0;
			var stategrp = 0;
			var advanced_html = "";
			var display_buttons = 0;
			var grid_buttons = 3;
			var group_buttons = 4;

			var slider_active = 1;
            if (!sliderObject(modal_states) || (json_store.ia7_config.prefs.state_slider !== undefined && json_store.ia7_config.prefs.state_slider == "no")) slider_active = 0;

			// get number of displayed buttons so we can display nicely.
			for (var i = 0; i < modal_states.length; i++){
				if (filterSubstate(modal_states[i],slider_active) !== 1) display_buttons++
			}
			if (display_buttons == 2) {
				grid_buttons = 6;
				group_buttons = 2;
			}
			if (display_buttons % 3 == 0) {
				grid_buttons = 4;
				group_buttons = 3;
			}
//            if (!sliderObject(modal_states) || (json_store.ia7_config.prefs.state_slider !== undefined && json_store.ia7_config.prefs.state_slider == "no"))	{		
                for (var i = 0; i < modal_states.length; i++){
                    if (filterSubstate(modal_states[i],slider_active) == 1) {
                        advanced_html += "<button class='btn btn-default col-sm-"+grid_buttons+" col-xs-"+grid_buttons+" hidden'>"+modal_states[i]+"</button>";
                        continue 
                    } else {
                        //buttonlength += 2 + modal_states[i].length 
                        buttonlength ++;
                    }
                    //if (buttonlength >= 25) {
                    if (buttonlength > group_buttons) {
                        stategrp++;
                        $('#control').find('.states').append("<div class='btn-group btn-block stategrp"+stategrp+"'></div>");
                        buttonlength = 1;
                    }
                    var color = getButtonColor(modal_states[i])
                    var disabled = ""
                    if (modal_states[i] == json_store.objects[entity].state) {
                        disabled = "disabled";
                    }
                    //global override
                    if (json_store.ia7_config.prefs.disable_current_state !== undefined && json_store.ia7_config.prefs.disable_current_state == "no") {
                        disabled = "";
                    }
                    //per object override
                    if (json_store.ia7_config.objects !== undefined && json_store.ia7_config.objects[entity] !== undefined) {
                        if (json_store.ia7_config.objects[entity].disable_current_state !== undefined && json_store.ia7_config.objects[entity].disable_current_state == "yes") {
                            disabled = "disabled";
                        } else {
                            disabled = "";
                        }
                    }
                $('#control').find('.states').find(".stategrp"+stategrp).append("<button class='btn col-sm-"+grid_buttons+" col-xs-"+grid_buttons+" btn-"+color+" "+disabled+"'>"+modal_states[i]+"</button>");					
                }
                if (slider_active) {
                    if ($(".stategrp0").children().length == 0) {  
                        $(".stategrp0").remove();
                    }
                   var slider_data = sliderDetails(modal_states);		                
                   $('#control').find('.states').append("<div id='slider' class='brightness-slider'></div>");					
                   var val = $(".object-state").text().replace(/\%/,'');
              
                   var position = slider_data.values.indexOf(val);
                   if (val == "on") position = slider_data.max;
                   if (val == "off") position = slider_data.min;
                   if (position == undefined || position < 0) position = 0;
                   $('#slider' ).slider({
                       min: slider_data.min,
                       max: slider_data.max,
                       value: position
                   });
                   $( "#slider" ).on( "slide", function(event, ui) {
                       var sliderstate = slider_data.values[ui.value];
                       if ((sliderstate == "100") && (slider_data.pct)) {
                           sliderstate = "on";
                       } else if ((sliderstate == "0") && (slider_data.pct)) {
                            sliderstate = "off";
                       } else {
                           if (slider_data.pct) sliderstate += "%";
                       }
                       $('#control').find('.object-state').text(sliderstate);

                   });
                   $( "#slider" ).on( "slidechange", function(event, ui) {
                       var sliderstate = slider_data.values[ui.value];
                       if ((sliderstate == "100") && (slider_data.pct)) {
                           sliderstate = "on";
                       } else if ((sliderstate == "0") && (slider_data.pct)) {
                            sliderstate = "off";
                       } else {
                           if (slider_data.pct) sliderstate += "%";
                       }
                       url= '/SET;none?select_item='+$(this).parents('.control-dialog').attr("entity")+'&select_state='+sliderstate;
                       $('#control').modal('hide');
                       $.get( url);
                   });

                 }
		$('#control').find('.states').append("<div class='btn-group advanced btn-block'>"+advanced_html+"</div>");
		$('#control').find('.states').find('.btn').click(function (){
			url= '/SET;none?select_item='+$(this).parents('.control-dialog').attr("entity")+'&select_state='+$(this).text();
			$('#control').modal('hide');
			$.get( url);
		});
		} else {
			//remove states from anything that doesn't have more than 1 state
			$('#control').find('.states').find('.btn-group').remove();
		}
		
		$('#control').find('.modal-body').find('.sched_control').remove();	
		$('#control').find('.modal-footer').find('.sched_submit').remove();	
		// Unique Schedule Data here
		if (json_store.objects[entity].schedule !== undefined) {

			var modify_jqcon_dow = function(cronstr,offset) {
				var cron = cronstr.split(/\s+/);
				cron[cron.length-1] = cron[cron.length-1].replace(/\d/gi, function adjust(x) { 
					return parseInt(x) + parseInt(offset); 
				});;			
				return cron.join(" ");
				}	

			var add_schedule = function(index,cron,label,state_sets) {
				if (cron === null) return;
				if (label == undefined) label = index;
				var sched_label_html = "<div class='col-xs-3 sched_label' value='"+cron+"'><input type='text' class='form-control sched"+index+"label' id='"+index+"' value='"+label+"'></div>"
				if (state_sets[0] !== null) {
					var display_label = label
					if (display_label.length > 7) display_label = display_label.substring(0,6)+"..";
					sched_label_html = "<div class='col-xs-3 sched_label dropdown'><button type='button' class='btn btn-default btn-list-dropdown dropdown-toggle sched_dropdown sched"+index+"label' id='"+index+"' value='"+label+"' style='width: 100%;' data-target='#' data-toggle='dropdown'>"+display_label+"</button><ul class='dropdown-menu sched-dropdown-menu'>";					
					for (var i = 0; i < state_sets.length; i++){
					    sched_label_html += "<li><a href='javascript: void(0)'id='"+index+"'>"+state_sets[i]+"</a></li>";
					}
					sched_label_html += "</ul></div>";
				}
				var sched_row_html = "<div class='row schedule_row schedule"+index+"entry'>"+sched_label_html+"<div id='"+index+"' class='schedule"+index+" sched_cron col-xs-8 cron-data'></div><div class='sched_rmbutton col-xs-1 sched"+index+"button'><button type='button' id='schedule"+index+"' class='pull-left btn btn-danger btn-xs schedrm'><i class='fa fa-minus'></i></button></div></div>"
				$('#control').find('.sched_control').append("<div class='cron_entry' id='"+index+"' value='"+cron+"'><span style='display:none' id='"+index+"' label='"+label+"' class='mhsched schedule"+index+"value'></span></div>");	
				$('#control').find('.sched_control').append(sched_row_html);

				$('.schedule'+index).jqCron({
					enabled_minute: true,
					multiple_dom: true,
					multiple_month: false,
					multiple_mins: true,
					multiple_dow: true,
					multiple_time_hours: true,
					multiple_time_minutes: true,
					default_period: 'week',
					default_value : cron,
					no_reset_button: true,
					numeric_zero_pad: true,
					label: index,
					bind_to: $('.schedule'+index+'value'),
		        	bind_method: {
            			set: function($element, value) {
                			$element.html(value);
                			$('.sched_submit').removeClass('disabled');  
                			$('.sched_submit').removeClass('btn-default');  
                			$('.sched_submit').addClass('btn-success');              			      			
           				 	}	
           			},		
					lang: 'en'
				});	
				$('#control').find('.form-control').change(function() {
					$('.schedule'+$(this).attr("id")+'value').attr("label",$(this).val());
                	$('.sched_submit').removeClass('disabled');  
                	$('.sched_submit').removeClass('btn-default');  
                	$('.sched_submit').addClass('btn-success'); 					
				});
				// So that the label and cron cell row heights line up
				$('.cron-data').resize(function() {
		    		$(".sched"+$(this).attr("id")+"label").height($(this).height()-12);  		
				});
				$('.dropdown-menu li a').on('click',function() {
					if 	(display_mode == "simple") return;
					$('.schedule'+$(this).attr("id")+'value').attr("label",$(this).text());	
					var display_label = $(this).text();
					if (display_label.length > 7) display_label = display_label.substring(0,6)+"..";
				    $(".sched"+$(this).attr("id")+"label").text(display_label);
				    $(".sched"+$(this).attr("id")+"label").val($(this).text());
            		$('.sched_submit').removeClass('disabled');  
            		$('.sched_submit').removeClass('btn-default');  
            		$('.sched_submit').addClass('btn-success');				    
				});
				$('#control').find('.schedule'+index).find('.schedule_row').append("<span class='input-group-addon'><button type='button' id='schedule"+index+"' class='btn btn-danger btn-xs schedrm'><i class='fa fa-minus'></i></button></span>");		
				$('.schedrm').on('click', function(){
					var sched_id = $( this ).attr("id")
					$('.'+sched_id+'entry').remove();
					$('.'+sched_id+'value').remove();
	                $('.sched_submit').removeClass('disabled');  
                	$('.sched_submit').removeClass('btn-default');  
                	$('.sched_submit').addClass('btn-success');
				});
			}

			$('#control').find('.modal-body').append("<div class='sched_control'><span><h4>Schedule Control<button type='button' class='pull-right btn btn-success btn-xs schedadd'><i class='fa fa-plus'></i></button></h4></span>");
			var sched_states = json_store.objects[entity].schedule[0][3];
			for (var i = 1; i < json_store.objects[entity].schedule.length; i++){
				var sched_index = json_store.objects[entity].schedule[i][0];
				var sched_cron = modify_jqcon_dow(json_store.objects[entity].schedule[i][1],1);
				var sched_label = json_store.objects[entity].schedule[i][2];
				add_schedule(sched_index,sched_cron,sched_label,sched_states);	
			}
			
			$('#control').find('.modal-footer').prepend('<button class="btn btn-default disabled sched_submit">Submit</button>');      	

			$('.schedadd').on('click', function(){
				var newid = Number($('.cron_entry:last').attr("id"))+1;
				if (isNaN(newid)) newid=1;
				var newlabel = newid;
				if (sched_states[0] !== null) newlabel=sched_states[0];
				add_schedule(newid,'0 0 * * 1-7',newlabel,sched_states);
            	$('.sched_submit').removeClass('disabled');  
            	$('.sched_submit').removeClass('btn-default');  
            	$('.sched_submit').addClass('btn-success'); 
			});
		
			$('.sched_submit').on('click', function(){
				if ($(this).hasClass("disabled")) return;
				var string = "";
				$('.mhsched').each(function(index,value) {
					string += $( this ).attr("id") + ',"' + modify_jqcon_dow($(this).text(),"-1") + '",' + $( this ).attr("label") + ',';
				});
				string = string.replace(/,\s*$/, ""); //remove the last comma
				var url="/SUB?ia7_update_schedule"+encodeURI("("+$(this).parents('.control-dialog').attr("entity")+","+string+")");
				$.get(url);
            	$('.sched_submit').addClass('disabled');  
            	$('.sched_submit').removeClass('btn-success');  
            	$('.sched_submit').addClass('btn-default');  
            	//emtpy the array since the long_poll should get the updated schedules.
            	json_store.objects[entity].schedule.length = 0; 			
			});			
			//hide the schedule controls if in simple mode
			if 	(display_mode == "simple") {
				$('.sched_submit').hide();
				$('.schedrm').hide();
				$('.schedadd').hide();
				$('#control').find('.modal-footer').hide();			
			} 

		} 
	
		//no schedule data so no button needed.	
		if ($('.sched_control').length == 0) { 
			$('#control').find('.modal-footer').hide();
		} else {
			$('#control').find('.modal-footer').show();
		}

		if (json_store.ia7_config.prefs.state_log_show !== "no") {
			//state log show last 4 (separate out set_by as advanced) - keeps being added to each time it opens
			// could load all log items, and only unhide the last 4 -- maybe later
			$('#control').find('.modal-body').find('.obj_log').remove();
			var object_log_header = "<div class='obj_log'><h4>Object Log";
			if (json_store.objects[entity].logger_status == "1") {
				var collid = $(location).attr('href').split("_collection_key=");
				var link = "/ia7/#path=/history?"+entity+"?1&_collection_key="+collid[1]+",";
				object_log_header += "<a href='"+link+"' class='pull-right btn btn-success btn-xs logger_data'><i class='fa fa-line-chart'></i></a>";
			}
			object_log_header += "</h4>"
//			$('#control').find('.modal-body').append("<div class='obj_log'><h4>Object Log</h4>");
			$('#control').find('.modal-body').append(object_log_header);
			for (var i = 0; i < json_store.ia7_config.prefs.state_log_entries; i++) {
				if (json_store.objects[entity].state_log[i] == undefined) continue;
				var slog = json_store.objects[entity].state_log[i].split("set_by=");
				$('#control').find('.obj_log').append(slog[0]+"<span class='mh_set_by hidden'>set_by="+slog[1]+"</span><br>");
			}
		}
		
		if (developer === true) 
		    $('.mhstatemode').show();
		else
		    $('.mhstatemode').hide();
		
		$('.mhstatemode').on('click', function(){
			$('#control').find('.states').find('.btn').removeClass('hidden');
			$('#control').find('.mh_set_by').removeClass('hidden');
		});
		$('.logger_data').on('click',function() {
			$('#control').modal('hide');
		});
}	

var authorize_modal = function(user) {

	//alert(user);
	var changed = "false";
	var af = "";
	var html = '<div class="form-group">';
	if (user !== "0") html += "<span id='currentuser'>Currently logged in as "+user+"<br><br></span>";
    html += '<label for="login-password">Password</label>';
    html += '<input type="password" class="form-control" name="password" id="password" placeholder="Password">';
  	html += '</div>';
  	html += '<b><span id="pwstatus" style="color:red"></span></b>';

//create footer buttons
	$('#loginModal').find('.modal-footer').html('<button type="button" class="btn btn-default" data-dismiss="modal">Close</button>');  

	if (user == "0") {			
		$('#loginModal').find('.modal-footer').prepend('<button type="submit" value="logon" class="btn btn-default btn-login-login">Logon');      	
	} else {  	
		$('#loginModal').find('.modal-footer').prepend('<button type="submit" value="logon" class="btn btn-default btn-login-login">Change User</button>');      	
		$('#loginModal').find('.modal-footer').prepend('<button type="button" class="btn btn-default btn-login-logoff">Logoff</button>');      	
	}
	$('#loginModal').find('.modal-body').html(html);
	$('#loginModal').modal({
		show: true
	});	
	$('#loginModal').on('shown.bs.modal', function () {
		if (user == "0") $('#password').focus();
	});
	$('#loginModal').on('hide.bs.modal', function () {
        if (changed == "true") location.reload();
    });
	$('.btn-login-logoff').click( function () {
		$.get ("/UNSET_PASSWORD");
		location.reload();
		$('#loginModal').modal('hide');
	});	
	$('#LoginModalpw').submit( function (e) {
		e.preventDefault();
		var encoded_data = $(this).serialize();
		encoded_data = encoded_data.replace(/\!/g,"%21"); //for some reason serialize doesn't encode a !...
		$.ajax({
			type: "POST",
			url: "/SET_PASSWORD_FORM",
			data: encoded_data,
			success: function(data){
				var status=data.match(/\<b\>(.*)\<\/b\>/gm);
				if (status[2] == "<b>Password was incorrect</b>") {
					//alert("Password was incorrect");
					$('#loginModal').find('#pwstatus').html("Password was incorrect");
					$("#loginModal").find('#password').val('');
					if (user !== "0") {
						user = "0";
						authorized = "false";
						changed = "true";
						$("#currentuser").html("");
						//location.reload();
					}	
				} else {
					location.reload();
					$('#loginModal').modal('hide');
				}
			}
		});
	});							
}

//Outputs the list of triggers
var trigger = function() {
	$.ajax({
	type: "GET",
	url: "/json/triggers",
	dataType: "json",
	success: function( json ) {
		var keys = [];
		for (var key in json.triggers) {
			keys.push(key);
		}
		var row = 0;
		for (var i = (keys.length-1); i >= 0; i--){
			var name = keys[i];
			if (row === 0){
				$('#list_content').html('');
			}
			var dark_row = '';
			if (row % 2 == 1){
				dark_row = 'dark-row';
			}
			$('#list_content').append("<div id='row_a_" + row + "' class='row top-buffer'>");
			$('#row_a_'+row).append("<div id='content_a_" + row + "' class='col-sm-12 col-sm-offset-0 col-md-10 col-md-offset-1 col-lg-8 col-lg-offset-2'>");
			$('#content_a_'+row).append("<div class='col-sm-5 trigger "+dark_row+"'><b>Name: </b><a id='name_"+row+"'>" + name + "</a></div>");
			$('#content_a_'+row).append("<div class='col-sm-4 trigger "+dark_row+"'><b>Type: </b><a id='type_"+row+"'>" + json.triggers[keys[i]].type + "</a></div>");
			$('#content_a_'+row).append("<div class='col-sm-3 trigger "+dark_row+"'><b>Last Run:</b> " + json.triggers[keys[i]].triggered + "</div>");
			$('#list_content').append("<div id='row_b_" + row + "' class='row'>");
			$('#row_b_'+row).append("<div id='content_b_" + row + "' class='col-sm-12 col-sm-offset-0 col-md-10 col-md-offset-1 col-lg-8 col-lg-offset-2'>");
			$('#content_b_'+row).append("<div class='col-sm-5 trigger "+dark_row+"'><b>Trigger:</b> <a id='trigger_"+row+"'>" + json.triggers[keys[i]].trigger + "</a></div>");
			$('#content_b_'+row).append("<div class='col-sm-7 trigger "+dark_row+"'><b>Code:</b> <a id='code_"+row+"'>" + json.triggers[keys[i]].code + "</a></div>");
			$.fn.editable.defaults.mode = 'inline';
			$('#name_'+row).editable({
				type: 'text',
				pk: 1,
				url: '/post',
				title: 'Enter username'
			});
			$('#type_'+row).editable({
				type: 'select',
				pk: 1,
				url: '/post',
				title: 'Select Type',
				source: [{value: 1, text: "Disabled"}, {value: 2, text: "NoExpire"}]
			});
			$('#trigger_'+row).editable({
				type: 'text',
				pk: 1,
				url: '/post',
				title: 'Enter trigger'
			});
			$('#code_'+row).editable({
				type: 'text',
				pk: 1,
				url: '/post',
				title: 'Enter code'
			});
			row++;
		}
	}
	});
};

$(document).ready(function() {
	// Start
	
	// Increment the counter
	$.get("/SUB?ia7_update_counter");
	
	changePage();
	//Watch for future changes in hash
	$(window).bind('hashchange', function() {
		changePage();
	});
	
	$("#mhstatus").click( function () {
		var link = json_store.collections[600].link;
		link = buildLink (link, "0,600");
	    window.location.href = link;
	});
	
	// Load up 'globals' -- notification and the status
	updateItem("ia7_status");	
	get_notifications();
	$('#Last_updated').remove();	
    get_stats();
	$("#toolButton").click( function () {
		// Need a 'click' event to turn on sound for mobile devices
		if (mobile_device() == "ios" ) {
			if (audio_init === undefined) {
				audioElement = document.getElementById('sound_element');
				audioElement.play();
			}
			audio_init = 1;
		}
		//
		var entity = $("#toolButton").attr('entity');
//		$('#optionsModal').modal('show');

        $("#optionsModal").modal('show').css({
            'margin-left': function () { //Horizontal centering
                var offset = "auto";
                if ($(window).width() < 768) {
                    offset = 0;
                    if (($(window).width() / 2 - 210) > 0) offset = ($(window).width() / 2 - 220);
                    }
                return offset;               
             }
        });	
        
        $( '.modal-backdrop').click(function(){
            $("#optionsModal").modal('hide');
        });

		$('#optionsModal').find('.object-title').html("Mr.House Options");
		$('#optionsModal').find('.options-dialog').attr("entity", "options");
		
		$('#optionsModal').find('.modal-body').html('<div class="btn-group btn-block" data-toggle="buttons"></div>');
		var simple_active = "active";
		var simple_checked = "checked";
		var develop_active = "";
		var develop_checked = "";
		var advanced_active = "";
		var advanced_checked = ""
		if (display_mode == "advanced") {
			simple_active = "";
			simple_checked = "";
			advanced_active = "active";
			advanced_checked = "checked"
			develop_active = "";
			develop_checked = "";
		}
		if (display_mode == "advanced" && developer === true)  {
			simple_active = "";
			simple_checked = "";
			advanced_active = "";
			advanced_checked = ""
			develop_active = "active";
			developed_checked = "checked"
		}		
		
		$('#optionsModal').find('.modal-body').find('.btn-group').append("<label class='btn btn-default mhmode col-xs-4 col-sm-4 "+simple_active+"'><input type='radio' name='mhmode2' id='simple' autocomplete='off'"+simple_checked+">simple</label>");
		$('#optionsModal').find('.modal-body').find('.btn-group').append("<label class='btn btn-default mhmode col-xs-4 col-sm-4 "+advanced_active+"'><input type='radio' name='mhmode2' id='advanced' autocomplete='off'"+advanced_checked+">expert</label>");
		$('#optionsModal').find('.modal-body').find('.btn-group').append("<label class='btn btn-default mhmode col-xs-4 col-sm-4 "+develop_active+"'><input type='radio' name='mhmode2' id='developer' autocomplete='off'"+develop_checked+">developer</label>");

		$('.mhmode').on('click', function(){
			if ($(this).find('input').attr('id') == "developer") {
				display_mode = "advanced";
				developer = true;
			} else {
				display_mode = $(this).find('input').attr('id');
				developer = false;
			}
			
			if (developer == true) {
			    //turn on collections drag-n-dropping
				$("#list_content").sortable({
				    tolerance: "pointer",
                    items: ".col-sm-4",
                    cursor: "move",
				    update: function( event, ui ) {
		  	            var URLHash = URLToHash();
                        //Get Sorted Array of Entities
                        var colids = $( "#list_content" ).sortable( "toArray", { attribute: "colid" } );
                        //convert strings to ints
                        var new_order = colids.map(function (x) { 
                            return parseInt(x, 10); 
                        });
                        //get the collection key
                        var col_key = URLHash._collection_key.substr(URLHash._collection_key.lastIndexOf(',') + 1);
                        json_store.collections[col_key].children = new_order;
                        dev_changes++;
                    }
				});	
				$('#list_content').disableSelection();					
			} else {
			    $("#list_content").sortable("destroy");
			    $("#list_content").enableSelection();	
			}
			document.cookie = "display_mode="+display_mode;
			document.cookie = "developer="+developer;
	
			changePage();
  		});
  		
  		var sound_active = "";
  		var banner_active = "";
  		var off_active = "active";
  		var sound_label = "Sound";
  		var banner_label = "Banner";
  		if ($(window).width() <= 768) { // make icons for mobile
			sound_label = "<i class='fa fa-volume-up'></i>";
			banner_label = "<i class='fa fa-list-ul'></i>";
		}
  		if (speech_banner === "yes") {
  			banner_active = "active";
  			off_active = "";
  		}
   		if (speech_sound === "yes") {
  			sound_active = "active";
  			off_active = "";
  		} 
     	if (notifications === "disabled") {
  			sound_active = "active";
  			off_active = "active";
  			banner_active = "active";
  		}				
  		// if notifications disabled then disable all the buttons
   		$('#optionsModal').find('.modal-body').append('<div class="btn-group btn-block btn-notifications" data-toggle="buttons"></div>');
		$('#optionsModal').find('.modal-body').find('.btn-notifications').append("<label class='btn btn-default mhnotify col-xs-6 col-sm-6 disabled'><input type='checkbox' name='mhnotify0' id='speech' autocomplete='off'>Speech</label>");
		$('#optionsModal').find('.modal-body').find('.btn-notifications').append("<label class='btn btn-default mhnotify mhnotifyopt col-xs-2 col-sm-2 "+sound_active+" "+notifications+"'><input type='checkbox' name='mhnotify1' id='sound' autocomplete='off'>"+sound_label+"</label>");
		$('#optionsModal').find('.modal-body').find('.btn-notifications').append("<label class='btn btn-default mhnotify mhnotifyopt col-xs-2 col-sm-2 "+banner_active+" "+notifications+"'><input type='checkbox' name='mhnotify2' id='banner' autocomplete='off'>"+banner_label+"</label>");
		$('#optionsModal').find('.modal-body').find('.btn-notifications').append("<label class='btn btn-default mhnotify mhnotifyoff col-xs-2 col-sm-2 "+off_active+" "+notifications+"'><input type='checkbox' name='mhnotify3' id='off' autocomplete='off'>Off</label>");
 		$('.mhnotify').on('click', function(){
			var speech_mode = $(this).find('input').attr('id');
			var button_active = $(this).hasClass('active');
			if (speech_mode == "off") {
				$('.mhnotifyopt').removeClass('active');
				speech_sound = "no";
				speech_banner = "no";
			} else {
				if (speech_mode === "sound") {
					if (button_active === true) {
						speech_sound = "no";
					} else {
						speech_sound = "yes";
					}
				} else if (speech_mode === "banner") {
					if (button_active === true) {
						speech_banner = "no";
					} else {
						speech_banner = "yes";
					}
				}
				$('.mhnotifyoff').removeClass('active');
				if ((speech_banner === "no") && (speech_sound === "no")) $('.mhnotifyoff').addClass('active');
			}
			document.cookie = "speech_sound="+speech_sound;
			document.cookie = "speech_banner="+speech_banner;
			//if off, then unselect others
  		});  		
		// parse the collection ID 500 and build a list of buttons
		var opt_collection_keys = 0;
		var opt_entity_html = "";
		var opt_entity_sort = json_store.collections[500].children;
		if (opt_entity_sort.length <= 0){
		opt_entity_html = "Childless Collection";
		} else {
		    for (var i = 0; i < opt_entity_sort.length; i++){
				var collection = opt_entity_sort[i];
				if (!(collection in json_store.collections)) continue;
				var link = json_store.collections[collection].link;
				var icon = json_store.collections[collection].icon;
				var name = json_store.collections[collection].name;
				if (json_store.collections[collection].iframe !== undefined) {
				   link = "/ia7/include/iframe.shtml?"+json_store.collections[collection].iframe;
				}
				var opt_next_collection_keys = opt_collection_keys + "," + opt_entity_sort[i];
				link = buildLink (link, opt_next_collection_keys);
				if (json_store.collections[collection].external !== undefined) {
					link = json_store.collections[collection].external;
				}
				//Check to see if this is the login button
				if (json_store.collections[collection].user !== undefined) {
//					if (name == undefined) {
//						authDetails();
//					} 
					opt_entity_html += "<a link-type='collection' user='"+json_store.collections[collection].user+"' class='btn btn-default btn-lg btn-block btn-list btn-login-modal' role='button'><i class='fa "+icon+" fa-2x fa-fw'></i>"+name+"</a>";
				} else {	
					opt_entity_html += "<a link-type='collection' href='"+link+"' class='btn btn-default btn-lg btn-block btn-list' role='button'><i class='fa "+icon+" fa-2x fa-fw'></i>"+name+"</a>";
				}
			}
		}
		$('#optionsModal').find('.modal-body').append(opt_entity_html);	
		$('.btn-login-modal').click( function () {
			$('#optionsModal').modal('hide');			
			var user = $(this).attr('user')
			authorize_modal(user);
		});						
		$('#optionsModal').find('.btn-list').click(function (){
			$('#optionsModal').modal('hide');
		});
	});

//Needed to floorplan sliders to work.
	$(document).on('mousedown', function (e) {
        if($(e.target).hasClass('popover-content')) {
            fp_popover_close = false;
        } else
            fp_popover_close = true; 
    });
	
//TODO remove me?	
	$('#mhresponse').click( function (e) {
		e.preventDefault();
		$form = $(this);
		//$.ajax({
		//	type: "POST",
		//	url: "/SET_PASSWORD_FORM",
		//	data: $(this).serialize(),
		//	success: function(data){
		//		console.log(data) 
		//		}
		//	});
	});		
});



//
// LICENSE
//
// This program is free software; you can redistribute it and/or modify it under the terms of
//   the GNU General Public License as published by the Free Software Foundation; 
//   either version 2 of the License, or (at your option) any later version.
//
// This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY;
//   without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. 
//   See the GNU General Public License for more details.
// 
// You should have received a copy of the GNU General Public License along with this program;
//   if not, write to the Free Software Foundation, Inc., 51 Franklin Street, Fifth Floor, Boston, MA  02110-1301, USA.
//
