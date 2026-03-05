export const NativeBiometric = {
  async isAvailable() {
    return { isAvailable: false, biometryType: 0 };
  },
  async setCredentials() {
    throw new Error("Biometric plugin is only available on native devices");
  },
  async getCredentials() {
    throw new Error("Biometric plugin is only available on native devices");
  },
  async verifyIdentity() {
    throw new Error("Biometric plugin is only available on native devices");
  },
  async deleteCredentials() {
    return true;
  },
};
