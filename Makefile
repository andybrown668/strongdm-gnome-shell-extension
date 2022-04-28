all:
	zip ~/Downloads/strongdm-gnome-shell-extension-v$(shell jq '.version' metadata.json).zip metadata.json extension.js LICENSE