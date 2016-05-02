import inspect
from copy import copy
from functools import wraps

from django.core.urlresolvers import reverse
from django.conf import settings
from django.db import models, transaction
from django.utils.text import slugify
from django.http import Http404

from opal.core import discoverable
from opal.models import Patient, Episode, EpisodeSubrecord
from opal.utils import stringport
from opal.utils import _itersubclasses

# So we only do it once
IMPORTED_FROM_APPS = False


def import_from_apps():
    """
    Iterate through installed apps attempting to import app.wardrounds
    This way we allow our implementation, or plugins, to define their
    own ward rounds.
    """
    for app in settings.INSTALLED_APPS:
        try:
            stringport(app + '.pathways')
        except ImportError as e:
            pass  # not a problem
    global IMPORTED_FROM_APPS
    IMPORTED_FROM_APPS = True
    return


def extract_pathway_field(some_fun):
    """ if a field isn't in the keywords, pull it off the model,
        if there isn't a model and its in the keywords then raise
        an exception
    """
    @wraps(some_fun)
    def func_wrapper(self):
        if some_fun.__name__ in self.other_args:
            return self.other_args[some_fun.__name__]
        else:
            if not self.model:
                NotImplementedError(
                    "%s needs to either be a keyword or we need a model set"
                )
            return some_fun(self)
    return func_wrapper


class Step(object):
    def __init__(self, model=None, **kwargs):
        self.model = model
        self.other_args = kwargs

    @extract_pathway_field
    def template_url(self):
        return reverse("form_template_view", kwargs=dict(
            model=self.model.get_api_name()
        ))

    @extract_pathway_field
    def title(self):
        return self.model.get_display_name()

    @extract_pathway_field
    def icon(self):
        return getattr(self.model, "_icon", None)

    @extract_pathway_field
    def api_name(self):
        return self.model.get_api_name()

    def to_dict(self):
        # this needs to handle singletons and whether we should update
        result = {}

        if self.model:
            result.update(dict(
                template_url=self.template_url(),
                title=self.title(),
                icon=self.icon(),
                api_name=self.api_name()
            ))

        result.update(self.other_args)
        return result

    def pre_save(self, data, user):
        pass


class MultSaveStep(Step):
    def to_dict(self):
        result = super(MultSaveStep, self).to_dict()

        if "template_url" not in self.other_args:
            result["template_url"] = "/templates/pathway/multi_save.html"

        if "controller_class" not in self.other_args:
            result["controller_class"] = "MultiSaveCtrl"

        result["model_form_url"] = reverse(
            "form_template_view", kwargs=dict(model=self.model)
        )
        result["record_url"] = reverse(
            "record_view", kwargs=dict(model=self.model)
        ),
        return result


class RedirectsToPatientMixin(object):
    def redirect_url(self, patient):
        return "/#/patient/{0}".format(patient.id)


class RedirectsToEpisodeMixin(object):
    def redirect_url(self, patient):
        episode = patient.episode_set.last()
        return "/#/patient/{0}/{1}".format(patient.id, episode.id)


class Pathway(discoverable.DiscoverableFeature):
    module_name = "pathways"

    # any iterable will do, this should be overridden
    steps = []

    def __init__(self, episode_id=None):
        self.episode_id = episode_id

    @property
    def episode(self):
        if self.episode_id is None:
            return None
        return Episode.objects.get(id=self.episode_id)

    @property
    def slug(self):
        return slugify(self.__class__.__name__)

    @classmethod
    def get(klass, slug):
        """
        Return a specific referral route by slug
        """
        for pathway in klass.list():
            if pathway().slug == slug:
                return pathway

        raise Http404("Pathway does not exist")

    @classmethod
    def list(klass):
        """
        Return a list of all ward rounds
        """
        if not IMPORTED_FROM_APPS:
            import_from_apps()

        return _itersubclasses(klass)

    @classmethod
    def get_template_names(klass):
        names = ['pathway/pathway_detail.html']
        if klass.slug:
            names.insert(0, 'pathway/{0}.html'.format(klass.slug))
        return names

    def save_url(self):
        return reverse("pathway_create", kwargs=dict(name=self.slug))

    def redirect_url(save, patient):
        return None

    def save(self, data, user):
        for step in self.get_steps():
            step.pre_save(data, user)

        patient = None

        if "demographics" in data:
            hospital_number = data["demographics"][0]["hospital_number"]
            patient_query = Patient.objects.filter(
                demographics__hospital_number=hospital_number
            )
            patient = patient_query.first()

        if not patient:
            patient = Patient()

        patient.bulk_update(data, user)
        return patient


    def get_steps(self):
        all_steps = []
        for step in self.steps:
            if inspect.isclass(step) and issubclass(step, models.Model):
                all_steps.append(Step(model=step))
            # else:
                all_steps.append(step)

        return all_steps

    def to_dict(self):
        # the dict we json to send over
        # in theory it takes a list of either models or steps
        # in reality you can swap out steps for anything with a todict method
        # we need to have a template_url, title and an icon, optionally
        # it can take a controller_class with the name of the angular
        # controller
        steps_info = []

        for step in self.steps:
            if inspect.isclass(step) and issubclass(step, models.Model):
                steps_info.append(Step(model=step).to_dict())
            else:
                steps_info.append(step.to_dict())

        return dict(
            steps=steps_info,
            title=self.display_name,
            save_url=self.save_url()
        )


class ModalPathway(Pathway):
    # so the theory is that we have a service that goes and gets a pathway based
    # on the url, this returns a serialised version of the pathway and opens the modal
    # doing all the work
    pass


class UnrolledPathway(Pathway):
    """
    An unrolled pathway will display all of it's forms
    at once, rather than as a set of steps.
    """

    def to_dict(self):
        as_dict = super(UnrolledPathway, self).to_dict()
        as_dict['unrolled'] = True
        return as_dict
