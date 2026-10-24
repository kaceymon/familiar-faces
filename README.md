# Familiar Faces

The face-drop arcade game from the cabinets in *This Feels Familiar*, as a standalone web app.
Drop the faces into the box; two of the same merge into the next one up, devil to UwU.

Play: https://kaceymon.github.io/familiar-faces/

- Always landscape: in portrait the page rotates itself. Installable as an app (Add to Home Screen), plays offline.
- Phone / tablet: drag in the box to aim, let go to drop. Tap the box to start.
- Desktop: move the mouse to aim, click to drop. Arrow keys aim, Space drops, M mutes, F fullscreen, C shows the combos.
- LG TV (Magic Remote): point at the box and press OK, or use the arrows + OK, or roll the scroll wheel to aim.
  Back opens settings mid-game and closes overlays.
- The SCOREBOARD is your best runs on this device (saved in the browser).

## LG webOS TV app

`sh webos/build.sh` packages the same files as a webOS app (`dist/com.kaceymon.familiarfaces_<version>_all.ipk`).
It needs the webOS CLI (`npm install -g @webos-tools/cli`). To install it on a TV in Developer Mode:

    ares-setup-device            # add the TV: its IP, port 9922, user prisoner
    ares-novacom --device tv --getkey   # enter the passphrase shown in the TV's Developer Mode app
    ares-install --device tv dist/com.kaceymon.familiarfaces_1.0.0_all.ipk
    ares-launch --device tv com.kaceymon.familiarfaces

Everything is plain HTML, CSS and JavaScript, no build step. The art and sounds are the cabinet's (`tools/facedrop` in the
world repo generated them). The Inter fonts are under the SIL Open Font License (`assets/OFL.txt`).
