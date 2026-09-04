/** Builds safe redirect addresses that may include a message name. */
/*
 * This function adds supplied names and values to a redirect address after the
 * question mark.
 *
 * URLSearchParams safely changes reserved characters into URL encoding, so user
 * input cannot break the address structure.
 *
 * Returns the Express redirect response.
 */
function redirectWithQuery(res, path, parameters) {
    const searchParams = new URLSearchParams(parameters);
    return res.redirect(`${path}?${searchParams.toString()}`);
}

module.exports = { redirectWithQuery };
