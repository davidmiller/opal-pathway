describe('pathway directives', function(){
  "use strict";

  var element, scope, $httpBackend, $compile, $rootScope;

  beforeEach(module('opal.directives', function($provide){
    $provide.service('Referencedata', function(){
      return {
        then: function(fn){ fn({ toLookuplists: function(){ return {}; } }); }
      };
    });
  }));

  beforeEach(inject(function($injector){
    var $rootScope = $injector.get('$rootScope');
    scope = $rootScope.$new();
    $httpBackend = $injector.get('$httpBackend');
    $compile = $injector.get('$compile');
  }));


  describe('saveMultipleWrapper template get', function(){
    it('should render its template', function(){
      var markup = '<div save-multiple-wrapper="editing.diagnosis"></div>';
      $httpBackend.expectGET('/templates/pathway/save_multiple.html').respond("");
      element = $compile(markup)(scope);
      scope.$digest();
    });
  });

  describe('requiredIfNotEmpty', function(){
    var markup = '<form name="form"><input name="something_model" ng-model="editing.something.interesting" required-if-not-empty="editing.something"></form>';
    it('should not be an error if none of the model is populated', function(){
        scope.editing = {something: {}};
        element = $compile(markup)(scope);
        var form = angular.element(element.find("input")[0]).scope().form;
        scope.$digest();
        expect(form.$error).toEqual({});
    });

    it('should be an error if some of the scope is filled in', function(){
      scope.editing = {something: {else: 'there'}};
      element = $compile(markup)(scope);
      var form = angular.element(element.find("input")[0]).scope().form;
      scope.$digest();
      expect(form.something_model.$error.requiredIfNotEmpty).toBe(true);
    });

    it('should stop being an error if subsequently a field is populated', function(){
      scope.editing = {something: {}};
      element = $compile(markup)(scope);
      var form = angular.element(element.find("input")[0]).scope().form;
      scope.$digest();
      expect(form.$error).toEqual({});
      scope.editing.something.else = "there";
      scope.$digest();
      expect(form.something_model.$error.requiredIfNotEmpty).toBe(true);
    });
  });

  describe("initialisation of multisave", function(){
    it('should create an array on the parent scope with an empty object if none exists', function(){
      scope.editing = {greeting: undefined};
      var markup = '<div save-multiple-wrapper="editing.greeting"><div id="holla" ng-repeat="editing in model.subrecords">[[ editing.salutation ]]</div></div>';
      element = $compile(markup)(scope);
      scope.$digest();
      expect(scope.editing.greeting).toEqual([{}]);
    });

    it('should create an array on the parent scope if given an object', function(){
      scope.editing = {greeting: {salutation: "hello"}};
      var markup = '<div save-multiple-wrapper="editing.greeting"><div id="holla" ng-repeat="editing in model.subrecords">[[ editing.salutation ]]</div></div>';
      element = $compile(markup)(scope);
      scope.$digest();
      expect(scope.editing.greeting).toEqual([{salutation: "hello"}]);
    });
  })

  describe('multiple save wrapper scope changes', function(){
    var innerScope;

    beforeEach(function(){
      scope.editing = {greetings: [
        {salutation: "Hello!"},
        {salutation: "Hola!"}
      ]};
      var markup = '<div save-multiple-wrapper="editing.greetings"><div id="greeting" ng-repeat="editing in model.subrecords">[[ editing.salutation ]]</div></div>';
      element = $compile(markup)(scope);
      scope.$digest();
      var input = angular.element($(element).find("#greeting")[0]);
      innerScope = input.scope();
    });

    it('should populate child scope', function(){
        expect(_.isFunction(innerScope.addAnother)).toBe(true);
        expect(_.isFunction(innerScope.remove)).toBe(true);
        expect(innerScope.model.subrecords[0].greetings.salutation).toBe("Hello!");
        expect(innerScope.model.subrecords[1].greetings.salutation).toBe("Hola!");
    });

    it('should change the child scope when something is added to the parent scope', function(){
      scope.editing.greetings.push({salutation: "Kon'nichiwa!"});
      scope.$digest();
      expect(innerScope.model.subrecords[0].greetings.salutation).toBe("Hello!");
      expect(innerScope.model.subrecords[1].greetings.salutation).toBe("Hola!");
      expect(innerScope.model.subrecords[2].greetings.salutation).toBe("Kon'nichiwa!");
    });

    it('should change the child scope when something is removed from the parent scope', function(){
      scope.editing.greetings.splice(1, 1);
      scope.$digest();
      expect(innerScope.model.subrecords.length).toBe(1);
      expect(innerScope.model.subrecords[0].greetings.salutation).toBe("Hello!");
    });

    it('should change the child scope when something is changed on the parent scope', function(){
      scope.editing.greetings[0].salutation = "Kon'nichiwa!";
      scope.$digest();
      expect(innerScope.model.subrecords.length).toBe(2);
      expect(innerScope.model.subrecords[0].greetings.salutation).toBe("Kon'nichiwa!");
    });

    it("should change the parent scope when something is added to the child scope", function(){
      innerScope.model.subrecords.push({greetings: {salutation: "Kon'nichiwa!"}});
      scope.$digest();
      expect(scope.editing.greetings.length).toBe(3);
      expect(scope.editing.greetings[2].salutation).toBe("Kon'nichiwa!");
    });

    it("should change the parent scpoe when something is removed to the child scope", function(){
      innerScope.model.subrecords.splice(1, 1);
      scope.$digest();
      expect(scope.editing.greetings.length).toBe(1);
      expect(scope.editing.greetings[0].salutation).toBe("Hello!");
    });

    it("should change the parent scope when something is removed to the child scope", function(){
      innerScope.model.subrecords.splice(1, 1);
      scope.$digest();
      expect(scope.editing.greetings.length).toBe(1);
      expect(scope.editing.greetings[0].salutation).toBe("Hello!");
    });

    it("add another should add a new object when we click add another", function(){
      innerScope.addAnother();
      scope.$digest();
      expect(scope.editing.greetings.length).toBe(3);
      expect(scope.editing.greetings[2]).toEqual({});
    });

    it("should remove new objects when remove is clicked", function(){
      innerScope.remove(1);
      scope.$digest();
      expect(scope.editing.greetings[0].salutation).toBe("Hello!");
    });

    it("should see changes made to additional objects on the inner objects should reflect externally", function(){
      innerScope.addAnother();
      scope.$digest();
      innerScope.model.subrecords[2].greetings.salutation = "Kon'nichiwa!";
      scope.$digest();
      expect(scope.editing.greetings[2].salutation).toBe("Kon'nichiwa!");
    });

    it("should see changes made to additional objects on the inner objects should reflect externally", function(){
      scope.editing.greetings.push({salutation: "Kon'nichiwa!"});
      scope.$digest();
      scope.editing.greetings[2].salutation = "Ciao";
      scope.$digest();
      expect(scope.editing.greetings[2].salutation).toBe("Ciao");
    });

  });
});
