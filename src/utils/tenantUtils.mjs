import conn from "../db/conn.mjs";

// Creating new MongoDb Connection object by Switching DB
const getTenantDB = (tenantId, modelName, schema) => {
    const dbName = tenantId;

    if(conn){
        const db = conn.useDb(dbName, { useCache: true});
        db.model(modelName, schema);
        return db;
    }

    throw new Error("We got a problem.");
}
export const getModelByTenant = (tenantId, modelName, schema) => {
    const tenantDb = getTenantDB(tenantId, modelName, schema);
    return tenantDb.model(modelName);
}