# Third-party notices (OPEX API)

## occt-import-js / Open CASCADE Technology

- Used for STEP/STP import in `src/catalogue/cad.ts`, as the unmodified npm package `occt-import-js`
  0.0.23. It is a WebAssembly build of Open CASCADE Technology.
- Licence: GNU Lesser General Public License v2.1, with the Open CASCADE exception. The full texts
  ship in the package: `occt-import-js/dist/license.occt-import-js.txt` and
  `occt-import-js/dist/license.occt.txt`.
- Source:
  - https://github.com/kovacsv/occt-import-js
  - https://dev.opencascade.org

The library is loaded dynamically and runs in a separate worker thread. Replacing it with another
build of the same package needs no change to OPEX.

## glTF Transform, meshoptimizer

- `@gltf-transform/*` (MIT) and `meshoptimizer` (MIT) process and compress the converted models.
