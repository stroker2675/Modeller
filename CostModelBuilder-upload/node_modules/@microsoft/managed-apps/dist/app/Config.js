/*!
 * Copyright (C) Microsoft Corporation. All rights reserved.
 */
import { initializeLogger } from '../telemetry';
export function setConfig(config) {
    if (config.logger) {
        initializeLogger(config.logger);
    }
}
//# sourceMappingURL=Config.js.map