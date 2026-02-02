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
        "autogeneratePattern": "",
        "hidden": false,
        "id": "text3545221687",
        "max": 0,
        "min": 0,
        "name": "taskId",
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
        "id": "text401296961",
        "max": 0,
        "min": 0,
        "name": "agentId",
        "pattern": "",
        "presentable": false,
        "primaryKey": false,
        "required": true,
        "system": false,
        "type": "text"
      },
      {
        "hidden": false,
        "id": "select1001949196",
        "maxSelect": 1,
        "name": "reason",
        "presentable": false,
        "required": false,
        "system": false,
        "type": "select",
        "values": [
          "assigned",
          "commented",
          "mentioned",
          "manual"
        ]
      }
    ],
    "id": "pbc_726510522",
    "indexes": [],
    "listRule": null,
    "name": "task_subscriptions",
    "system": false,
    "type": "base",
    "updateRule": null,
    "viewRule": null
  });

  return app.save(collection);
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_726510522");

  return app.delete(collection);
})
