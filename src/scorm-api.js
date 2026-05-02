import { logger } from './logger.js';

class SCORMApi12 {
  constructor() {
    this.cmi = {};
    this.initialized = false;
    this.lastError = "0";
  }

  LMSInitialize(param) {
    logger.scorm("LMSInitialize", { param });
    if (this.initialized) {
      this.lastError = "101"; // Already initialized
      return "false";
    }
    this.initialized = true;
    this.lastError = "0";
    return "true";
  }

  LMSFinish(param) {
    logger.scorm("LMSFinish", { param });
    if (!this.initialized) {
      this.lastError = "301"; // Not initialized
      return "false";
    }
    this.initialized = false;
    this.lastError = "0";
    return "true";
  }

  LMSGetValue(element) {
    logger.scorm("LMSGetValue", { element });
    if (!this.initialized) {
      this.lastError = "301";
      return "";
    }
    this.lastError = "0";
    const value = this.cmi[element] !== undefined ? this.cmi[element] : "";
    logger.info(`LMSGetValue returned: ${value}`);
    return value;
  }

  LMSSetValue(element, value) {
    logger.scorm("LMSSetValue", { element, value });
    if (!this.initialized) {
      this.lastError = "301";
      return "false";
    }
    this.cmi[element] = value;
    this.lastError = "0";
    return "true";
  }

  LMSCommit(param) {
    logger.scorm("LMSCommit", { param, currentData: this.cmi });
    this.lastError = "0";
    return "true";
  }

  LMSGetLastError() {
    logger.scorm("LMSGetLastError", null);
    return this.lastError;
  }

  LMSGetErrorString(errorCode) {
    logger.scorm("LMSGetErrorString", { errorCode });
    const errors = {
      "0": "No error",
      "101": "General Exception",
      "201": "Invalid argument error",
      "202": "Element cannot have children",
      "203": "Element not an array. Cannot have count",
      "301": "Not initialized",
      "401": "Not implemented error",
      "402": "Invalid set value, element is a keyword",
      "403": "Element is read only",
      "404": "Element is write only",
      "405": "Incorrect Data Type"
    };
    return errors[errorCode] || "Unknown Error";
  }

  LMSGetDiagnostic(errorCode) {
    logger.scorm("LMSGetDiagnostic", { errorCode });
    return this.LMSGetErrorString(errorCode);
  }
}

class SCORMApi2004 {
  constructor() {
    this.cmi = {};
    this.initialized = false;
    this.lastError = "0";
  }

  Initialize(param) {
    logger.scorm("Initialize", { param });
    if (this.initialized) {
      this.lastError = "103"; // Already initialized
      return "false";
    }
    this.initialized = true;
    this.lastError = "0";
    return "true";
  }

  Terminate(param) {
    logger.scorm("Terminate", { param });
    if (!this.initialized) {
      this.lastError = "112"; // Termination Before Initialization
      return "false";
    }
    this.initialized = false;
    this.lastError = "0";
    return "true";
  }

  GetValue(element) {
    logger.scorm("GetValue", { element });
    if (!this.initialized) {
      this.lastError = "122";
      return "";
    }
    this.lastError = "0";
    const value = this.cmi[element] !== undefined ? this.cmi[element] : "";
    logger.info(`GetValue returned: ${value}`);
    return value;
  }

  SetValue(element, value) {
    logger.scorm("SetValue", { element, value });
    if (!this.initialized) {
      this.lastError = "132";
      return "false";
    }
    this.cmi[element] = value;
    this.lastError = "0";
    return "true";
  }

  Commit(param) {
    logger.scorm("Commit", { param, currentData: this.cmi });
    this.lastError = "0";
    return "true";
  }

  GetLastError() {
    logger.scorm("GetLastError", null);
    return this.lastError;
  }

  GetErrorString(errorCode) {
    logger.scorm("GetErrorString", { errorCode });
    return `Error string for ${errorCode}`;
  }

  GetDiagnostic(errorCode) {
    logger.scorm("GetDiagnostic", { errorCode });
    return `Diagnostic for ${errorCode}`;
  }
}

export function injectSCORMApis(targetWindow) {
  targetWindow.API = new SCORMApi12();
  targetWindow.API_1484_11 = new SCORMApi2004();
  logger.info("SCORM APIs (1.2 and 2004) injected into iframe window.");
}
