/** Safely turns passwords into stored hashes and checks later login attempts. */
const crypto = require("crypto");

/*
 * This function turns a password into a value that is safe to store.
 *
 * A salt is a random value added before hashing so identical passwords do not
 * have identical stored values. Scrypt is a deliberately expensive password-
 * hashing algorithm that makes password guessing slower. The salt must be
 * stored with the hash so the same calculation can be repeated during login.
 *
 * Returns a Promise whose value is a `salt:hash` string written with hexadecimal
 * characters. It throws an error if secure random generation or scrypt fails.
 */
async function hashPassword(password) {
    const salt = crypto.randomBytes(16).toString("hex");
    const hashedPassword = await new Promise((resolve, reject) => {
        crypto.scrypt(password, salt, 64, (error, derivedKey) => {
            if (error) {
                reject(error);
                return;
            }

            resolve(`${salt}:${derivedKey.toString("hex")}`);
        });
    });
    return hashedPassword;
}

/*
 * This function checks a submitted password against a stored password hash.
 *
 * It repeats scrypt using the salt stored with the account. The final comparison
 * always takes roughly the same amount of time, which prevents an attacker from
 * learning correct pieces of the hash by measuring response times.
 *
 * Returns a Promise whose value is true when the password matches and false
 * when it does not. It throws an error if scrypt fails to run.
 */
async function verifyPassword(password, storedHashedPassword) {
    const [salt, storedDerivedKey] = storedHashedPassword.split(":");

    // A malformed stored value cannot represent a password created by hashPassword.
    if (!salt || !storedDerivedKey) {
        return false;
    }

    const derivedKey = await new Promise((resolve, reject) => {
        crypto.scrypt(password, salt, 64, (error, key) => {
            if (error) {
                reject(error);
                return;
            }

            resolve(key);
        });
    });

    const storedDerivedKeyBuffer = Buffer.from(storedDerivedKey, "hex");

    // timingSafeEqual requires equally sized buffers and throws when their lengths differ.
    if (derivedKey.length !== storedDerivedKeyBuffer.length) {
        return false;
    }

    return crypto.timingSafeEqual(derivedKey, storedDerivedKeyBuffer);
}

module.exports = {
    hashPassword,
    verifyPassword
};
