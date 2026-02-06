/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = new Collection({
    "createRule": null,
    "deleteRule": null,
    "fields": [
      {
        "autogeneratePattern": "[a-z0-9]{15}",
        "hidden": false,
        "id": "text3208210256",
        "max": 15,
        "min": 15,
        "name": "id",
        "pattern": "^[a-z0-9]+$",
        "presentable": false,
        "primaryKey": true,
        "required": true,
        "system": true,
        "type": "text"
      },
      {
        "hidden": false,
        "id": "date3280375435",
        "max": "",
        "min": "",
        "name": "ts",
        "presentable": false,
        "required": true,
        "system": false,
        "type": "date"
      },
      {
        "hidden": false,
        "id": "select2622159618",
        "maxSelect": 1,
        "name": "actorType",
        "presentable": false,
        "required": true,
        "system": false,
        "type": "select",
        "values": [
          "human",
          "agent"
        ]
      },
      {
        "autogeneratePattern": "",
        "hidden": false,
        "id": "text646683805",
        "max": 0,
        "min": 0,
        "name": "agent",
        "pattern": "",
        "presentable": false,
        "primaryKey": false,
        "required": false,
        "system": false,
        "type": "text"
      },
      {
        "autogeneratePattern": "",
        "hidden": false,
        "id": "text715664714",
        "max": 0,
        "min": 0,
        "name": "vaultItem",
        "pattern": "",
        "presentable": false,
        "primaryKey": false,
        "required": false,
        "system": false,
        "type": "text"
      },
      {
        "hidden": false,
        "id": "select1204587666",
        "maxSelect": 1,
        "name": "action",
        "presentable": false,
        "required": true,
        "system": false,
        "type": "select",
        "values": [
          "create",
          "update",
          "rotate",
          "disable",
          "enable",
          "delete",
          "resolve",
          "reveal"
        ]
      },
      {
        "autogeneratePattern": "",
        "hidden": false,
        "id": "text3047408806",
        "max": 0,
        "min": 0,
        "name": "sessionKey",
        "pattern": "",
        "presentable": false,
        "primaryKey": false,
        "required": false,
        "system": false,
        "type": "text"
      },
      {
        "autogeneratePattern": "",
        "hidden": false,
        "id": "text1257461224",
        "max": 0,
        "min": 0,
        "name": "toolName",
        "pattern": "",
        "presentable": false,
        "primaryKey": false,
        "required": false,
        "system": false,
        "type": "text"
      },
      {
        "hidden": false,
        "id": "select2063623452",
        "maxSelect": 1,
        "name": "status",
        "presentable": false,
        "required": true,
        "system": false,
        "type": "select",
        "values": [
          "ok",
          "deny",
          "error"
        ]
      },
      {
        "autogeneratePattern": "",
        "hidden": false,
        "id": "text1574812785",
        "max": 0,
        "min": 0,
        "name": "error",
        "pattern": "",
        "presentable": false,
        "primaryKey": false,
        "required": false,
        "system": false,
        "type": "text"
      },
      {
        "hidden": false,
        "id": "json3622966325",
        "maxSize": 2000000,
        "name": "meta",
        "presentable": false,
        "required": false,
        "system": false,
        "type": "json"
      }
    ],
    "id": "pbc_1064374390",
    "indexes": [
      "CREATE INDEX `idx_agent_ts_vault_audit` ON `vault_audit` (`agent`, `ts`)",
      "CREATE INDEX `idx_ts_vault_audit` ON `vault_audit` (`ts`)"
    ],
    "listRule": null,
    "name": "vault_audit",
    "system": false,
    "type": "base",
    "updateRule": null,
    "viewRule": null
  });

  return app.save(collection);
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_1064374390");

  return app.delete(collection);
})
