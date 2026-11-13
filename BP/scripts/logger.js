import { config } from "./config";

export const warn = message => console.warn(`${config.general.logPrefix} ${message}`);
