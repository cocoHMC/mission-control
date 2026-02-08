/// <reference path="../pb_data/types.d.ts" />
migrate(
  (app) => {
    const agents = app.findCollectionByNameOrId("agents");

    agents.fields.add(
      new Field({
        hidden: false,
        id: "file_avatar",
        maxSelect: 1,
        maxSize: 8388608,
        mimeTypes: ["image/*"],
        name: "avatar",
        presentable: false,
        protected: true,
        required: false,
        system: false,
        thumbs: [],
        type: "file",
      }),
    );

    return app.save(agents);
  },
  (app) => {
    const agents = app.findCollectionByNameOrId("agents");
    agents.fields.removeById("file_avatar");
    return app.save(agents);
  },
);

