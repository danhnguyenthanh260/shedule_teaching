const AppLogger = {
  info: function(message, data) {
    const log = `[INFO] ${new Date().toISOString()} - ${message}`;
    console.log(log, data || '');
    Logger.log(log);
    if (data) Logger.log(JSON.stringify(data));
  },

  error: function(message, error) {
    const log = `[ERROR] ${new Date().toISOString()} - ${message}`;
    console.error(log, error || '');
    Logger.log(log);
    if (error) Logger.log(JSON.stringify(error));
  },

  warn: function(message, data) {
    const log = `[WARN] ${new Date().toISOString()} - ${message}`;
    console.warn(log, data || '');
    Logger.log(log);
    if (data) Logger.log(JSON.stringify(data));
  }
};
