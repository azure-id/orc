# Playbook — Django (BE)

Generic best-practice defaults for Django 4/5 (incl. Django REST Framework when
present). The codifier OVERRIDES the Conventions with the project's observed
style; the Invariants always stand.

**Activation triggers:** Django, DRF, `models.Model`, `views.py`, `urls.py`,
serializer, queryset, migration, `manage.py`, `settings.py`.

## Conventions (PROJECT-OVERRIDABLE — match the codebase)
- App-per-domain layout (`<app>/models.py`, `views.py`, `urls.py`, `serializers.py`
  when DRF) — match the project's app granularity and any `services.py` layer.
- View style: match the project (CBVs vs FBVs vs DRF ViewSets — never mix a new
  style in).
- Forms/serializers per resource (match the project's naming + location).
- URL naming via `app_name` + `name=` reverses (match the project's scheme).
- Settings split (base/dev/prod) — match whatever structure exists.

## Invariants (ALWAYS — BLOCKING)
- ORM or parameterized queries ONLY — never string-interpolate into `raw()`/`extra()`.
- Every model change ships its migration (`makemigrations` output committed).
- Validate all input through Forms/Serializers/validators — no raw
  `request.POST`/`request.data` reads into the DB.
- CSRF protection stays on for browser-facing views; never blanket `csrf_exempt`.
- Auth/permission checks on every non-public view (decorator, mixin, or DRF
  permission class) — never rely on the template hiding a link.
- Never expose secrets, stack traces, or `DEBUG=True` behavior in responses;
  config/secrets via env/settings, never hardcoded.
- No N+1 loops over related objects — use `select_related`/`prefetch_related`.

## Validation gate (default acceptance checks; measurable-only)
Enforce only what is machine-checkable in the target repo; anything needing
tooling the project lacks is advisory, never gating.
- `python manage.py check` clean; `makemigrations --check --dry-run` shows no
  missing migrations.
- Every new endpoint returns the expected status codes: 200 read · 201 create ·
  404 missing id · 403 unauthenticated/forbidden · 400 invalid body.
- Every new view has an explicit auth/permission declaration (visible in diff).
- Lint/type clean IF the project uses ruff/flake8/mypy.
- Advisory only (never gate; requires tooling the project may lack): coverage
  target on the new surface, p95 latency budget.

## Worked example (SHAPE REFERENCE — the project's observed layout ALWAYS wins)
DRF flavor shown. Imitate the SHAPE (model → serializer → view → url), never
this exact layout/naming when the project differs (plain-Django projects: the
same slice with a Form + CBV).

```python
# orders/models.py
class Order(models.Model):
    item = models.ForeignKey("catalog.Item", on_delete=models.PROTECT)
    quantity = models.PositiveIntegerField()
    created_at = models.DateTimeField(auto_now_add=True)

# orders/serializers.py — validated input, explicit fields (never "__all__" blindly)
class OrderSerializer(serializers.ModelSerializer):
    class Meta:
        model = Order
        fields = ["id", "item", "quantity", "created_at"]
        read_only_fields = ["id", "created_at"]

    def validate_quantity(self, value):
        if value == 0:
            raise serializers.ValidationError("quantity must be positive")
        return value

# orders/views.py — auth explicit, no N+1
class OrderViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = OrderSerializer
    queryset = Order.objects.select_related("item")

# orders/urls.py
router = DefaultRouter()
router.register("orders", OrderViewSet, basename="order")
urlpatterns = router.urls
```

## Delivery order
model + migration → serializer/form → view → url wiring → test.
