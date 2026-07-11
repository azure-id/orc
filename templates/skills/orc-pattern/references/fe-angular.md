# Playbook — Angular (FE)

Generic best-practice defaults for Angular 17+ (standalone components, signals).
The codifier OVERRIDES the Conventions with the project's observed style; the
Invariants always stand.

**Activation triggers:** Angular, `@Component`, `@Injectable`, standalone,
signals, RxJS, `angular.json`, NgModule, directive, `HttpClient`.

## Conventions (PROJECT-OVERRIDABLE — match the codebase)
- Standalone components (match the project — NgModule projects stay NgModule).
- State: match the project (signals, RxJS services, NgRx) — never mix a new
  state style in.
- Feature-folder layout (`features/<domain>/`) — match the project's structure.
- Data access via injected services wrapping `HttpClient`; components stay thin.
- Template style: match the project (control-flow `@if/@for` vs `*ngIf/*ngFor`).

## Invariants (ALWAYS — BLOCKING)
- Every subscription is cleaned up (`takeUntilDestroyed`, `async` pipe, or
  explicit unsubscribe) — no leaked subscriptions.
- `track` (or `trackBy`) on every `@for`/`*ngFor` over mutable lists.
- Never call functions with side effects from templates; keep change detection safe.
- Sanitize/never bypass DOM sanitization (`bypassSecurityTrust*` is a last
  resort with justification, never a convenience).
- No secrets in client code or environment files that ship to the browser.
- Accessibility: semantic HTML + ARIA on interactive elements; label every input.
- HTTP errors handled (typed error path or interceptor) — no silent `subscribe()`.

## Validation gate (default acceptance checks; measurable-only)
Enforce only what is machine-checkable in the target repo; anything needing
tooling the project lacks is advisory, never gating.
- `ng build` clean — **zero type errors** (strict IF the project uses it).
- Lint clean IF the project has a linter.
- Every new `@for`/`*ngFor` has a `track`/`trackBy` (visible in the diff).
- Every new subscription shows its cleanup path (visible in the diff).
- Advisory only (never gate; requires tooling the project may lack):
  bundle-size budget, Lighthouse score on changed routes.

## Worked example (SHAPE REFERENCE — the project's observed layout ALWAYS wins)
Standalone + signals flavor shown. Imitate the SHAPE (thin component → injected
service → cleaned-up stream), never this exact style when the project differs.

```ts
// features/orders/order.service.ts — data access lives in the service
@Injectable({ providedIn: "root" })
export class OrderService {
  private http = inject(HttpClient);
  getOrder(id: string): Observable<Order> {
    return this.http.get<Order>(`/api/orders/${id}`);
  }
}

// features/orders/order-status.component.ts — thin, cleaned-up, tracked
@Component({
  selector: "app-order-status",
  standalone: true,
  template: `
    @if (order(); as o) {
      <section aria-label="Order status">
        <h2>{{ o.title }}</h2>
        <ul>
          @for (item of o.items; track item.id) {
            <li>{{ item.name }}</li>
          }
        </ul>
      </section>
    } @else {
      <p role="status">Loading order…</p>
    }
  `,
})
export class OrderStatusComponent {
  private route = inject(ActivatedRoute);
  private orders = inject(OrderService);

  order = toSignal(
    this.route.paramMap.pipe(
      map((p) => p.get("id")!),
      switchMap((id) => this.orders.getOrder(id)),
      takeUntilDestroyed(),          // cleanup, always
    ),
  );
}
```

## Delivery order
service → component → template/styles → route wiring → test.
