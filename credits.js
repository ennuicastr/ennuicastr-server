/*
 * Copyright (c) 2020 Yahweasel
 *
 * Permission to use, copy, modify, and/or distribute this software for any
 * purpose with or without fee is hereby granted, provided that the above
 * copyright notice and this permission notice appear in all copies.
 *
 * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
 * WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
 * MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY
 * SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
 * WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION
 * OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF OR IN
 * CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
 */

/* Functions relating to credits, converting credits back and forth to money,
 * and charging/crediting accounts */

const config = require("./config.js");
const cost = config.creditCost;
const db = require("./db.js").db;

/**
 * Convert number of credits to their purchase price in US cents
 */
function creditsToCents(credits) {
    return Math.round(credits * cost.currency / cost.credits);
}

/**
 * Convert number of credits to their purchase price in US dollars, as a string
 */
function creditsToDollars(credits) {
    var cents = creditsToCents(credits)+"";
    if (cents.length < 2)
        cents = "0" + cents;
    if (cents.length <= 2)
        return "0." + cents;
    return cents.slice(0, cents.length-2) + "." + cents.slice(cents.length-2);
}

/**
 * Convert a number of cents to the number of credits it buys, rounding up
 */
function centsToCredits(cents) {
    /* Be generous (ceil) when they're buying, though this ought to always be
     * an integer anyway */
    return Math.ceil(cents * cost.credits / cost.currency);
}

/**
 * Returns a JavaScript string which converts an expression v in cents to
 * credits.
 */
function centsToCreditsClient(v) {
    return "(Math.ceil((" + v + ") * " + cost.credits + " / " + cost.currency + "))";
}

/**
 * Converts a number of credits to the number of hours and minutes of recording
 * at regular quality that it buys.
 */
function creditsToHM(credits) {
    var hours = Math.floor(credits / 3600);
    var minutes = Math.floor((credits % 3600) / 60) + "";
    if (minutes.length < 2) minutes = "0" + minutes;
    return hours + ":" + minutes;
}

/**
 * How many credits does this account have?
 */
async function accountCredits(uid) {
    var row = await db.getP("SELECT credits FROM credits WHERE uid=@UID;", {"@UID": uid});
    if (row)
        return row.credits;
    return 0;
}

/**
 * Standard "you have n credits" message for clients
 */
function creditsMessage(credits) {
    return "You have $" + creditsToDollars(credits) + " in credit (" + creditsToHM(credits) + " recording time).";
}

module.exports = {
    creditsToCents,
    creditsToDollars,
    centsToCredits,
    centsToCreditsClient,
    creditsToHM,
    accountCredits,
    creditsMessage
};
