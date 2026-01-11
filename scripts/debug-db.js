
try {
    console.log('Attempting to import db/index.js...');
    await import('../db/index.js');
    console.log('DB import successful.');
} catch (error) {
    console.error('DB Import FAILED:');
    console.error(error);
    if (error.code === 'SQLITE_ERROR') {
        console.error('SQLite Error Detail:', error.message);
    }
}
process.exit(0);
