export const CapacitorHealthkit = {
  async isAvailable() {
    return { available: false };
  },
  async requestAuthorization() {
    throw new Error("Health plugin is only available on native devices");
  },
  async queryHKitSampleType() {
    return { resultData: [] };
  },
};
