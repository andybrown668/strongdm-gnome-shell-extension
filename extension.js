/* extension.js
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 2 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */

/* exported init */

const GETTEXT_DOMAIN = 'my-indicator-extension';

const {GObject, St, Clutter} = imports.gi;

const Gettext = imports.gettext.domain(GETTEXT_DOMAIN);
const _ = Gettext.gettext;

const ExtensionUtils = imports.misc.extensionUtils;
const Main = imports.ui.main;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;

const Util = imports.misc.util;
const GLib = imports.gi.GLib;

const Me = imports.misc.extensionUtils.getCurrentExtension();
const Gio = imports.gi.Gio;
const Mainloop = imports.mainloop;

const SDMIndicator = GObject.registerClass(
    class SDMIndicator extends PanelMenu.Button {
        _init() {
            super._init(0.0, _('StrongDM extension'));
            this.add_child(new St.Icon({
                icon_name: 'go-jump-symbolic',
                style_class: 'system-status-icon',
            }));
            this._status = "";
            this._refresh();
            this._sourceId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 60, this._refresh.bind(this));
        }

        destroy() {
            super.destroy();
            GLib.Source.remove(this._sourceId);
        }

        _refresh() {
            let cmd = "status | tr -s ' ' | sed -e 's/^\s//g' | sed -e 's/not connected/0/g' | sed -e 's/connected/1/g'";
            this._sdm(cmd, (stdout) => {
                if (this._parseStatus(stdout)) {
                    this._createMenu();
                }
            });

            return true;
        }

        // create some structure from the sdm status output
        _parseStatus(status) {
            if (this._status == status) {
                return false;
            }
            this._status = status;
            this._info = {sections: []};
            let isWebsite = false;
            let section;
            for (var line of this._status.split(/\r?\n/)) {
                if (line == " " || line == "") {
                    continue;
                }
                //new section?
                if (line.startsWith(" DATASOURCE")) {
                    section = {type: "datasource", name: "Datasources", entries: []};
                    this._info.sections.push(section);
                    continue;
                } else if (line.startsWith(" SERVER")) {
                    section = {type: "server", name: "Servers (ssh)", entries: []};
                    this._info.sections.push(section);
                    continue;
                } else if (line.startsWith(" WEBSITE")) {
                    section = {type: "url", name: "Websites", entries: []};
                    this._info.sections.push(section);
                    isWebsite = true;
                    continue;
                }
                if (section == undefined) {
                    continue;
                }
                // split the line to get connected status for datasources and servers, and url for web sites
                var entry;
                if (isWebsite) {
                    let parts = line.split("http");

                    //split the url part again to get the labels
                    let p2 = parts[1].split(" ");
                    line = parts[0];
                    section.entries.push({name: line, url: p2[0]});
                } else {
                    let parts2 = line.split(" ");
                    let active = parts2[2] == "1";
                    line = parts2[1];
                    let host = line;
                    section.entries.push({name: host, active: active});
                }
            }
            return true;
        }

        _sdm(cmd, then) {
            print(cmd);
            let proc = Gio.Subprocess.new(
                ["bash", "-c", "sdm " + cmd],
                Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE
            );

            proc.communicate_utf8_async(null, null, (proc, res) => {
                try {
                    let [, stdout, stderr] = proc.communicate_utf8_finish(res);

                    if (proc.get_successful()) {
                        if (then) {
                            then(stdout);
                        }
                    } else {
                        throw new Error(stderr);
                    }
                } catch (e) {
                    logError(e);
                } finally {
                }
            });
        }

        _sdmSSH(resource) {
            GLib.spawn_command_line_sync("gnome-terminal -- sdm ssh " + resource);
        }

        _createMenu() {
            let pop = this.menu;
            this.menu.removeAll();

            // create menu and count number of active connections
            let active = 0;
            for (var section of this._info.sections) {
                for (var entry of section.entries) {
                    if (entry.active == true) {
                        active++;
                    }
                }
            }
            if (active > 0) {
                let disconnectAll = new PopupMenu.PopupImageMenuItem("Disconnect All (" + active + " connected)", 'action-unavailable-symbolic');
                disconnectAll.connect('activate', () => {
                    disconnectAll.label.text = "Disconnecting all resources...";
                    this._sdm("disconnect --all", (stdout) => this._refresh);
                });
                this.menu.addMenuItem(disconnectAll);
            }

            // pull active server connections to top-menu
            for (let section of this._info.sections) {
                if (section.type != "server") {
                    continue;
                }
                for (let entry of section.entries) {
                    if (!entry.active) {
                        continue;
                    }
                    let m = new PopupMenu.PopupImageMenuItem(entry.name, 'utilities-terminal-symbolic');
                    m.connect('activate', () => {
                        this._sdmSSH(entry.name);
                    });
                    this.menu.addMenuItem(m);
                }
            }

            // create menu and count number of active connections
            for (let section of this._info.sections) {
                let pop = new PopupMenu.PopupSubMenuMenuItem(section.name, true);
                switch (section.type) {
                    case "url":
                        pop.icon.icon_name = 'video-display-symbolic';
                        break;
                    case "server":
                        pop.icon.icon_name = 'utilities-terminal-symbolic';
                        break;
                    case "datasource":
                        pop.icon.icon_name = 'media-floppy-symbolic';
                        break;
                }
                section.entries.sort((a, b) => (a.active && !b.active) ? -1 : ((b.active && !a.active) ? 1 : a.name.localeCompare(b.name)));
                for (let entry of section.entries) {
                    let m;
                    switch (section.type) {
                        case "url":
                            m = new PopupMenu.PopupMenuItem(entry.name);
                            m.connect('activate', () => {
                                Gio.AppInfo.launch_default_for_uri("http" + entry.url, null);
                            });
                            break;
                        case "server":
                        case "datasource":
                            m = new PopupMenu.PopupSwitchMenuItem(entry.name, entry.active);
                            m.connect('toggled', (object, value) => {
                                if (value) {
                                    this._sdmSSH(entry.name);
                                } else {
                                    this._sdm("disconnect " + entry.name);
                                }
                                this._refresh();
                            });
                            break;
                    }
                    pop.menu.addMenuItem(m);
                }
                this.menu.addMenuItem(pop);
            }

        }
    });

class Extension {
    constructor(uuid) {
        this._uuid = uuid;

        ExtensionUtils.initTranslations(GETTEXT_DOMAIN);
    }

    enable() {
        this._indicator = new SDMIndicator();
        Main.panel.addToStatusArea(this._uuid, this._indicator);
    }

    disable() {
        this._indicator.destroy();
        this._indicator = null;
    }
}

function init(meta) {
    return new Extension(meta.uuid);
}


