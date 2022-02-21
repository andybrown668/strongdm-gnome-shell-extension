# strongdm-gnome-shell-extension

Control existing StrongDM client (sdm).
* see status of resources (scraped from ```sdm status```)
* disconnect all resources (```sdm disconnect --all```)
* disconnect a single resource (```sdm disconnect [resource]```)
* open an ssh connection to a connected resource (```sdm ssh [resource]```)
* open a website resource with your default browser

Limitations:
* extension assumes the sdm client is logged in, and provides no login/logout functionality
* command line interactions with ```sdm``` are only detected once a minute - until then the menu can be inaccurate

Future:
* use ```sdm status``` Tags to layout the menu structure
* convince StrongDM to add an option - ```sdm status --json --watch``` - to return a json stream of status

https://extensions.gnome.org/extension/4836/strongdm/

StrongDM - https://www.strongdm.com
