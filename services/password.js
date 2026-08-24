const crypto = require("crypto");

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

async function verifyPassword(password, storedHashedPassword) {
    const [salt, storedDerivedKey] = storedHashedPassword.split(":");

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

    if (derivedKey.length !== storedDerivedKeyBuffer.length) {
        return false;
    }

    return crypto.timingSafeEqual(derivedKey, storedDerivedKeyBuffer);
}

module.exports = {
    hashPassword,
    verifyPassword
};
