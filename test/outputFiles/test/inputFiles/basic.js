App.Person = Ember.Object.extend({
    id: 0,
    name: "",
    hello: Ember.computed('one','two', function (a,b) {
        return `${b} ${a}`
    })
  });
   
  var person = App.Person.create();
  person.name = "Duncan";
  person.id = 0;

