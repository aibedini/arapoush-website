"use client";

import dynamic from "next/dynamic";

/**
 * The OPEX form, code-split: server-rendered as usual, but its JavaScript (and the shared form
 * validator) only downloads on pages that actually show a form. Page-builder blocks use this, so a
 * page that merely allows blocks pays nothing for forms it does not have.
 */
const LazyOpexForm = dynamic(() => import("./OpexForm"));
export default LazyOpexForm;
