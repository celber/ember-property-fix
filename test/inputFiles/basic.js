App.Person = Ember.Object.extend({
    id: 0,
    name: "",
    hello: function (a,b) {
        return `${b} ${a}`
    }.property('one','two')
  });
   
  var person = App.Person.create();
  person.name = "Duncan";
  person.id = 0;

