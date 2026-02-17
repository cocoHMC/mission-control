/// <reference path="../pb_data/types.d.ts" />
migrate(
  (app) => {
    const collection = app.findCollectionByNameOrId("pbc_9051200002");

    const has = (name) => {
      try {
        return !!collection.fields.getByName(name);
      } catch {
        return false;
      }
    };

    if (!has("commandId")) {
      collection.fields.add(
        new Field({
          hidden: false,
          id: "text_workflow_runs_commandId",
          max: 0,
          min: 0,
          name: "commandId",
          pattern: "",
          presentable: false,
          primaryKey: false,
          required: false,
          system: false,
          type: "text",
        })
      );
    }

    return app.save(collection);
  },
  (app) => {
    const collection = app.findCollectionByNameOrId("pbc_9051200002");
    collection.fields.removeByName("commandId");
    return app.save(collection);
  }
);
