function redirectWithQuery(res, path, parameters) {
    const searchParams = new URLSearchParams(parameters);
    return res.redirect(`${path}?${searchParams.toString()}`);
}

module.exports = { redirectWithQuery };
