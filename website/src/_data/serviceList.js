// Every catalogue item as one flat list, each carrying its group, so
// src/service.njk can paginate one page per service (/services/<id>.html).
const services = require('./services.json');

module.exports = services.groups.flatMap((group) =>
  group.items.map((item) => ({ ...item, group: { id: group.id, label: group.label } }))
);
