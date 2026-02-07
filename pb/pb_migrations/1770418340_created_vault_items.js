/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  try {
    // Backward/upgrade safety: older installs may already have this collection created
    // (via bootstrap scripts or previous schema). Avoid crashing PocketBase on startup.
    if (app.findCollectionByNameOrId("vault_items")) return;
  } catch {
    // ignore and proceed with creation
  }
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
        "id": "text2441093337",
        "max": 0,
        "min": 0,
        "name": "handle",
        "pattern": "",
        "presentable": false,
        "primaryKey": false,
        "required": true,
        "system": false,
        "type": "text"
      },
      {
        "hidden": false,
        "id": "select2363381545",
        "maxSelect": 1,
        "name": "type",
        "presentable": false,
        "required": true,
        "system": false,
        "type": "select",
        "values": [
          "api_key",
          "username_password",
          "oauth_refresh",
          "secret"
        ]
      },
      {
        "autogeneratePattern": "",
        "hidden": false,
        "id": "text3785202386",
        "max": 0,
        "min": 0,
        "name": "service",
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
        "id": "text4166911607",
        "max": 0,
        "min": 0,
        "name": "username",
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
        "id": "text4010976081",
        "max": 0,
        "min": 0,
        "name": "secretCiphertext",
        "pattern": "",
        "presentable": false,
        "primaryKey": false,
        "required": true,
        "system": false,
        "type": "text"
      },
      {
        "autogeneratePattern": "",
        "hidden": false,
        "id": "text1423705083",
        "max": 0,
        "min": 0,
        "name": "secretIv",
        "pattern": "",
        "presentable": false,
        "primaryKey": false,
        "required": true,
        "system": false,
        "type": "text"
      },
      {
        "autogeneratePattern": "",
        "hidden": false,
        "id": "text982669396",
        "max": 0,
        "min": 0,
        "name": "secretTag",
        "pattern": "",
        "presentable": false,
        "primaryKey": false,
        "required": true,
        "system": false,
        "type": "text"
      },
      {
        "hidden": false,
        "id": "number2192305280",
        "max": null,
        "min": null,
        "name": "keyVersion",
        "onlyInt": false,
        "presentable": false,
        "required": false,
        "system": false,
        "type": "number"
      },
      {
        "hidden": false,
        "id": "select1734193069",
        "maxSelect": 1,
        "name": "exposureMode",
        "presentable": false,
        "required": false,
        "system": false,
        "type": "select",
        "values": [
          "inject_only",
          "revealable"
        ]
      },
      {
        "hidden": false,
        "id": "bool2231267043",
        "name": "disabled",
        "presentable": false,
        "required": false,
        "system": false,
        "type": "bool"
      },
      {
        "autogeneratePattern": "",
        "hidden": false,
        "id": "text18589324",
        "max": 0,
        "min": 0,
        "name": "notes",
        "pattern": "",
        "presentable": false,
        "primaryKey": false,
        "required": false,
        "system": false,
        "type": "text"
      },
      {
        "hidden": false,
        "id": "json1874629670",
        "maxSize": 2000000,
        "name": "tags",
        "presentable": false,
        "required": false,
        "system": false,
        "type": "json"
      },
      {
        "hidden": false,
        "id": "date1185732563",
        "max": "",
        "min": "",
        "name": "lastUsedAt",
        "presentable": false,
        "required": false,
        "system": false,
        "type": "date"
      },
      {
        "hidden": false,
        "id": "date3476426451",
        "max": "",
        "min": "",
        "name": "lastRotatedAt",
        "presentable": false,
        "required": false,
        "system": false,
        "type": "date"
      }
    ],
    "id": "pbc_1282868802",
    "indexes": [
      "CREATE UNIQUE INDEX `idx_agent_handle_vault_items` ON `vault_items` (`agent`, `handle`)"
    ],
    "listRule": null,
    "name": "vault_items",
    "system": false,
    "type": "base",
    "updateRule": null,
    "viewRule": null
  });

  return app.save(collection);
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_1282868802");

  return app.delete(collection);
})
