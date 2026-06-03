"""
Inline mock backend for the Python eval runner.
Mirrors the rules used in frontend-next/lib/mock-backend.ts so evals can
run without standing up the Next.js server.
"""
import re
from typing import Any

CURRENCY = "$"

def _stat_cards(items):
    return {"kind": "stat_cards", "items": items}

def _lead_list(items):
    return {"kind": "lead_list", "items": items}

def _project_grid(items):
    return {"kind": "project_grid", "items": items}

def _bar_chart(title, data):
    return {"kind": "bar_chart", "title": title, "data": data}

def _donut(title, data):
    return {"kind": "donut_chart", "title": title, "data": data}

def _attr_table(rows):
    return {"kind": "attribution_table", "rows": rows}

def _md(body):
    return {"kind": "markdown_block", "body": body}


def respond(agent: str, message: str, ctx: dict) -> dict:
    """Return {agent, text, canvas?} based on agent + keywords."""
    m = message.lower().strip()
    if agent == "solara":
        return _solara(m)
    if agent == "marina":
        return _marina(m)
    if agent == "nova":
        return _nova(m)
    return {"agent": "atlas", "text": "Routing.", "canvas": {"type": "route", "agent": "atlas", "target_agent": "solara", "reason": "default"}}


# ---------------------------------------------------------------------
# Solara
# ---------------------------------------------------------------------

def _solara(m: str) -> dict:
    # cross-domain deflects first
    if re.search(r"(factur|cobr|cashflow|margen|revenue)", m):
        return {"agent": "solara", "text": "Eso lo tiene Marina, te paso con ella.", "canvas": None}
    if re.search(r"(canal|atribución|funnel|origen)", m):
        return {"agent": "solara", "text": "Eso lo tiene Nova.", "canvas": None}

    if "pepe lopez" in m or "pepe lópez" in m:
        return {"agent": "solara", "text": "No encontré a 'pepe lopez' en tu pipeline.", "canvas": None}

    if "stale" in m or "sin tocar" in m:
        return {
            "agent": "solara",
            "text": "Tenés 3 hot sin tocar (últimos 30 días, n=3). Martín Gomez urgente.",
            "canvas": {"type": "display", "agent": "solara", "blocks": [
                _stat_cards([
                    {"label": "Stale hot", "value": "3"},
                    {"label": "Oldest touch", "value": "4d"},
                ]),
                _lead_list([
                    {"id": "b1111111", "name": "Martín Gomez", "company": "Startup.io", "status": "qualified", "ai_score": 0.87},
                    {"id": "b5555555", "name": "Diego López", "company": "Medium Co", "status": "negotiation", "ai_score": 0.78},
                ])
            ]}
        }

    if "pipeline" in m or "panorama" in m:
        return {
            "agent": "solara",
            "text": "Pipeline activo: 5 deals abiertos, $46,500 ponderado.",
            "canvas": {"type": "display", "agent": "solara", "blocks": [
                _stat_cards([
                    {"label": "Open deals", "value": "5"},
                    {"label": "Pipeline value", "value": "$46,500"},
                    {"label": "Hot", "value": "2"},
                ]),
            ]}
        }

    if "hot" in m or "calientes" in m:
        return {
            "agent": "solara",
            "text": "Top hot esta semana: Martín y Diego.",
            "canvas": {"type": "display", "agent": "solara", "blocks": [
                _lead_list([
                    {"id":"b1111111","name":"Martín Gomez","company":"Startup.io","status":"qualified","ai_score":0.87},
                    {"id":"b5555555","name":"Diego López","company":"Medium Co","status":"negotiation","ai_score":0.78}
                ])
            ]}
        }

    if re.search(r"pasá a (carlos|carlos rivera)", m) or re.search(r"carlos a proposal", m):
        return {"agent": "solara", "text": "Carlos está en 'contacted'. No puedo saltearlo a 'proposal' sin pasar por 'qualified' (te hace falta una discovery primero).", "canvas": None}

    if re.search(r"pasá a (sarah|sarah lee).*negot", m):
        return {
            "agent": "solara",
            "text": "Va. Sarah ya tiene propuesta enviada, queda mover a negotiation.",
            "canvas": {"type": "workflow", "agent": "solara", "idempotency_key": "test",
                       "stepper": [{"name": "Validate transition", "status": "done"},
                                   {"name": "Update status", "status": "pending"},
                                   {"name": "Append history", "status": "pending"}],
                       "diff": [{"table": "leads", "row_id": "b2222222", "field": "status", "from": "proposal", "to": "negotiation"}],
                       "cta": {"confirm_label": "Confirmar", "cancel_label": "Cancelar"}}
        }

    if "draft" in m or "follow-up" in m or "followup" in m:
        return {
            "agent": "solara",
            "text": "Listo, te dejo 2 variantes — warm y direct. Editá antes de copiar.",
            "canvas": {"type": "interactive", "agent": "solara", "controls": [
                {"kind": "textarea", "label": "Warm version", "id": "warm", "value": "Martín — vi tu mensaje sobre el rebranding. ¿Te sirve una llamada de 20 min esta semana para definir scope?"},
                {"kind": "textarea", "label": "Direct version", "id": "direct", "value": "Martín — ¿te mando la propuesta el martes o preferís terminar de definir el scope antes?"}
            ], "submit": {"label": "Guardar draft en historial"}}
        }

    if "listo" in m and "sarah" in m:
        return {"agent": "solara", "text": "Sarah tiene scope clear y discovery hecho — está lista. Solo confirmá el budget signal antes de mandar.",
                "canvas": {"type":"display","agent":"solara","blocks":[_md("✓ Decision-maker · ✓ Budget · ✓ Timeline · ✓ Scope · ? Pricing model · ✓ Discovery")]}}

    if "listo" in m and "carlos" in m:
        return {"agent": "solara", "text": "Carlos no — falta discovery y el scope está fuzzy. Recomiendo una llamada antes de mandar propuesta.", "canvas": None}

    if re.search(r"marc[áa] como perdid", m) and ("contacted" in m or "60 días" in m):
        return {"agent": "solara", "text": "Esto es bulk irreversible. Necesito que escribas 'BORRAR' para confirmar — es destructiva. Esperá 5s.",
                "canvas": {"type":"workflow","agent":"solara","cooldown_seconds":5,"confirm_phrase":"BORRAR","idempotency_key":"test",
                           "stepper":[{"name":"Identify candidates","status":"done"},{"name":"Mark as lost","status":"pending"}],
                           "cta":{"confirm_label":"Confirmar borrado","cancel_label":"Cancelar"}}}

    if "perdí" in m or "lo perdimos" in m:
        return {"agent": "solara", "text": "Lamento la pérdida — pasa. ¿Querés que registre la razón y veamos qué aprender? Si fue precio, hay 2 más en el pipeline con perfil parecido.", "canvas": None}

    if "rápido" in m or "urgente" in m:
        return {"agent": "solara", "text": "Hot: Martín (qualified, 4d sin tocar).",
                "canvas":{"type":"display","agent":"solara","blocks":[_stat_cards([{"label":"Hot stale","value":"1"}])]}}

    if "conver" in m and "martín" in m:
        return {"agent": "solara", "text": "Antes de convertir necesito propuesta aceptada. ¿Ya la firmaron?", "canvas": None}

    if "conver" in m and ("lucía" in m or "lucia" in m):
        return {"agent": "solara", "text": "Lucía está en 'won'. Conversión lista.",
                "canvas": {"type":"workflow","agent":"solara","idempotency_key":"test",
                           "stepper":[{"name":"Create project","status":"pending"},{"name":"Copy metadata","status":"pending"},{"name":"Update lead","status":"pending"},{"name":"Log activity","status":"pending"}],
                           "diff":[{"table":"projects","row_id":"new","field":"client","from":None,"to":"Happy Co"}],
                           "cta":{"confirm_label":"Convertir","cancel_label":"Cancelar"}}}

    if "ideas" in m or "cerrar más" in m:
        return {"agent": "solara", "text": "Tres movidas concretas: 1) tocá a Diego antes del viernes — está en negotiation, 2) hacé discovery con Carlos en vez de esperar, 3) cobrale a Lucía esta semana para liberar bandwidth.", "canvas": None}

    return {"agent": "solara", "text": "Contame qué necesitás del pipeline.", "canvas": None}


# ---------------------------------------------------------------------
# Marina
# ---------------------------------------------------------------------

def _marina(m: str) -> dict:
    if re.search(r"(lead|prospecto|pipeline|stale|caliente|stale)", m):
        return {"agent": "marina", "text": "Eso lo lleva Solara.", "canvas": None}
    if re.search(r"(canal|funnel|atribución|growth)", m):
        return {"agent": "marina", "text": "Eso lo lleva Nova.", "canvas": None}

    if "mes" in m:
        return {"agent":"marina","text":"Mayo (parcial): cobrado $44,000.00 vs comprometido $72,000.00. Margen ponderado 31%.",
                "canvas":{"type":"display","agent":"marina","blocks":[
                    _stat_cards([
                        {"label":"Cobrado","value":"$44,000.00"},
                        {"label":"Comprometido","value":"$72,000.00"},
                        {"label":"Margen","value":"31%"},
                        {"label":"Loss projects","value":"1"}
                    ])
                ]}}

    if "pérdida" in m or "perdida" in m or "loss" in m:
        return {"agent":"marina","text":"1 proyecto en pérdida: Fintech Dashboard (Bank Corp).",
                "canvas":{"type":"display","agent":"marina","blocks":[
                    _project_grid([
                        {"id":"a1111111","title":"Fintech Dashboard","client":"Bank Corp","health":"loss","profit_margin":-12.5}
                    ])
                ]}}

    if "bank corp" in m and ("por qué" in m or "porque" in m):
        return {"agent":"marina","text":"Bank Corp está en pérdida por collection lag — total_agreed $24,000.00 vs total_collected $12,000.00 (50%). Direct expenses normales, lo imputado se comió el margen.","canvas":None}

    if "break-even" in m or "marcá" in m and "bank corp" in m:
        return {"agent":"marina","text":"No puedo cambiar `health` directamente — lo recalcula la DB via trigger. Si querés ajustar, modificamos total_collected o imputed_expenses.","canvas":None}

    if "mové" in m and "imputado" in m and "directo" in m:
        return {"agent":"marina","text":"Reclasifico $400.00 de imputed a direct. Margen pasa de 53% a 48% en SaaS Branding.",
                "canvas":{"type":"workflow","agent":"marina","idempotency_key":"test",
                          "stepper":[{"name":"Read finances","status":"done"},{"name":"Reclassify","status":"pending"}],
                          "diff":[{"table":"finances","row_id":"a3333333","field":"direct_expenses","from":100,"to":500},
                                  {"table":"finances","row_id":"a3333333","field":"imputed_expenses","from":3500,"to":3100}],
                          "cta":{"confirm_label":"Reclasificar","cancel_label":"Cancelar"}}}

    if "ar aging" in m or "aging" in m or "debe" in m:
        return {"agent":"marina","text":"AR breakdown: $12,000.00 en 0-30, $0 en 31-60, $0 en 61-90, $0 en 90+.",
                "canvas":{"type":"display","agent":"marina","blocks":[
                    _stat_cards([{"label":"Total AR","value":"$12,000.00"},{"label":"Over 60d","value":"0%"}]),
                    _bar_chart("AR aging", [{"x":"0-30","y":12000},{"x":"31-60","y":0},{"x":"61-90","y":0},{"x":"90+","y":0}])
                ]}}

    if "12 semanas" in m or "próximas" in m or "proximas" in m:
        return {"agent":"marina","text":"Proyección a 12 semanas: $28,000.00. Depende de que paguen a tiempo — Bank Corp es el más riesgoso.",
                "canvas":{"type":"display","agent":"marina","blocks":[_stat_cards([{"label":"Expected inflow","value":"$28,000.00"}])]}}

    if "cobr" in m and ("lucía" in m or "lucia" in m):
        return {"agent":"marina","text":"Lucía está en 'won' con proposal aceptada. Te genero el borrador de factura.",
                "canvas":{"type":"workflow","agent":"marina","idempotency_key":"test",
                          "stepper":[{"name":"Read proposal","status":"done"},{"name":"Compose draft","status":"pending"},{"name":"Save","status":"pending"}],
                          "diff":[{"table":"proposals","row_id":"p_lucia","field":"invoice_data","from":None,"to":"{...}"}],
                          "cta":{"confirm_label":"Crear borrador","cancel_label":"Cancelar"}}}

    if "cobr" in m and "diego" in m:
        return {"agent":"marina","text":"Diego sigue en negotiation — la propuesta no está aceptada todavía. No puedo facturar primero.","canvas":None}

    if "runway" in m:
        return {"agent":"marina","text":"Livv todavía no tracea expenses a nivel compañía — solo a nivel proyecto. Para calcular runway necesito que conectemos un libro contable o ingreses fixed costs.","canvas":None}

    if "subscription" in m:
        return {"agent":"marina","text":"'subscription' no es válido. Las opciones son: fixed, hourly, retainer.","canvas":None}

    if "facturé" in m or "facture" in m or ("revenue" in m and "2026" in m):
        return {"agent":"marina","text":"2026 YTD (mayo): $44,000.00 cobrado.","canvas":{"type":"display","agent":"marina","blocks":[_stat_cards([{"label":"YTD 2026","value":"$44,000.00"}])]}}

    if "editorial" in m:
        return {"agent":"marina","text":"Editorial Site: comprometido $12,000.00, cobrado $0 — todavía no facturado. Margen no aplicable hasta que entre el primer pago.",
                "canvas":{"type":"display","agent":"marina","blocks":[_stat_cards([{"label":"Comprometido","value":"$12,000.00"},{"label":"Cobrado","value":"$0.00 — not yet billed"}])]}}

    if "eur" in m and "tech store" in m:
        return {"agent":"marina","text":"El default del tenant es USD. No puedo mezclar EUR en una misma fila de finances sin cambiar la moneda del proyecto.","canvas":None}

    if "margen" in m and ("saas" in m or "branding" in m):
        return {"agent":"marina","text":"SaaS Branding: profit_margin 53.13%. Agreed $8,000.00, collected $6,000.00, expenses totales $3,600.00.","canvas":None}

    return {"agent":"marina","text":"Decime qué número querés ver.","canvas":None}


# ---------------------------------------------------------------------
# Nova
# ---------------------------------------------------------------------

def _nova(m: str) -> dict:
    if re.search(r"(lead urgente|hot|caliente|follow-up)", m):
        return {"agent":"nova","text":"Eso lo tiene Solara.","canvas":None}
    if re.search(r"(cobr|facturé|cashflow|margen|revenue)", m):
        return {"agent":"nova","text":"Eso lo tiene Marina.","canvas":None}

    if "funnel" in m or "embudo" in m:
        return {"agent":"nova","text":"Funnel (últimos 30 días, n=47): new→contacted 60%, contacted→qualified 45%, qualified→proposal 38%, proposal→won 20%.",
                "canvas":{"type":"display","agent":"nova","blocks":[
                    _stat_cards([{"label":"Top of funnel","value":"47"},{"label":"Won","value":"2"},{"label":"End-to-end","value":"4.3%"}]),
                    _bar_chart("Funnel", [{"x":"new","y":47},{"x":"contacted","y":28},{"x":"qualified","y":13},{"x":"proposal","y":5},{"x":"won","y":1}])
                ]}}

    if "dónde vienen" in m or "donde vienen" in m or "atribución" in m:
        return {"agent":"nova","text":"Últimos 30 días (n=47): Web Form 38%, Instagram 26%, Referral 17%, LinkedIn 11%, Unattributed 8%.",
                "canvas":{"type":"display","agent":"nova","blocks":[
                    _donut("Source mix", [{"label":"Web Form","value":18},{"label":"Instagram","value":12},{"label":"Referral","value":8},{"label":"LinkedIn","value":5},{"label":"Unattributed","value":4}]),
                    _attr_table([
                        {"source":"Web Form","leads_n":18,"qualified_n":7,"won_n":1,"revenue":8000},
                        {"source":"Instagram","leads_n":12,"qualified_n":6,"won_n":1,"revenue":7500},
                        {"source":"Referral","leads_n":8,"qualified_n":2,"won_n":0,"revenue":0},
                        {"source":"LinkedIn","leads_n":5,"qualified_n":1,"won_n":0,"revenue":0},
                        {"source":"Unattributed","leads_n":4,"qualified_n":0,"won_n":0,"revenue":0}
                    ])
                ]}}

    if "forecast" in m and "trimestre" in m:
        return {"agent":"nova","text":"Forecast quarter (n=5 deals abiertos): best $46,500.00, likely $24,800.00, worst $11,000.00.",
                "canvas":{"type":"display","agent":"nova","blocks":[_stat_cards([{"label":"Best","value":"$46,500.00"},{"label":"Likely","value":"$24,800.00"},{"label":"Worst","value":"$11,000.00"}])]}}

    if "forecast" in m and ("12 meses" in m or "año" in m):
        return {"agent":"nova","text":"No hago forecast a 12 meses — el horizonte introduce demasiada varianza. Cap es 1 trimestre.","canvas":None}

    if "perdiendo" in m and "negotiation" in m:
        return {"agent":"nova","text":"En negotiation tenés n=1 (Diego). Muestra muy chica para concluir bottleneck.","canvas":None}

    if "perdiendo" in m or "bottleneck" in m:
        return {"agent":"nova","text":"El choke point es qualified → proposal: perdés 8 de 13 (últimos 30 días, n=47). Mirá la skill proposal-readiness en Solara.",
                "canvas":{"type":"display","agent":"nova","blocks":[_bar_chart("Drops", [{"x":"new→contacted","y":19},{"x":"contacted→qualified","y":15},{"x":"qualified→proposal","y":8}])]}}

    if "semana" in m and ("como me va" in m or "cómo me va" in m):
        return {"agent":"nova","text":"Confirmame ventana: ¿últimos 7 días corridos o esta semana calendario (lun-hoy)?","canvas":None}

    if "linkedin" in m and "tendencia" in m:
        return {"agent":"nova","text":"LinkedIn tiene n=5 leads en 30 días — señal incipiente, no me alcanza para confirmar tendencia. Volvé a preguntar cuando juntemos 20+.","canvas":None}

    if "instagram" in m and "plata" in m:
        return {"agent":"nova","text":"Correlación: Instagram tiene 1 won = $7,500.00. La atribución de revenue es aproximada porque joinan por nombre de cliente. No implica causación.","canvas":None}

    if "wbr" in m or "weekly business review" in m:
        return {"agent":"nova","text":"WBR de la semana — preview antes de guardar.",
                "canvas":{"type":"workflow","agent":"nova","idempotency_key":"test",
                          "stepper":[{"name":"Funnel snapshot","status":"done"},{"name":"Attribution","status":"done"},{"name":"Forecast","status":"done"},{"name":"Bottleneck","status":"done"},{"name":"Compose","status":"done"},{"name":"Save artifact","status":"pending"}],
                          "diff":[{"table":"agents.artifacts","row_id":"new","field":"kind","from":None,"to":"wbr"}],
                          "cta":{"confirm_label":"Guardar WBR","cancel_label":"Cancelar"}}}

    if "north star" in m or "north-star" in m:
        return {"agent":"nova","text":"Anoto: north_star_metric = 'revenue_per_won_deal'. ¿Confirmás?",
                "canvas":{"type":"workflow","agent":"nova","idempotency_key":"test",
                          "stepper":[{"name":"Validate","status":"done"},{"name":"Save","status":"pending"}],
                          "diff":[{"table":"tenant_config","row_id":"current","field":"north_star_metric","from":"won_deals_per_quarter","to":"revenue_per_won_deal"}],
                          "cta":{"confirm_label":"Guardar","cancel_label":"Cancelar"}}}

    if "seo" in m:
        return {"agent":"nova","text":"No puedo recomendar SEO solo por tráfico — necesito ver conversión y revenue por canal. SEO atribuible a Web Form: 18 leads, 1 won ($8,000.00). Bajo para concluir.","canvas":None}

    if "esta semana vs" in m or "vs la anterior" in m:
        return {"agent":"nova","text":"Últimos 7 días vs 7 días previos: leads -8%, qualified +14%, won 0 ambos lados.",
                "canvas":{"type":"display","agent":"nova","blocks":[_stat_cards([{"label":"Leads Δ","value":"-8%"},{"label":"Qualified Δ","value":"+14%"}])]}}

    if "conversion" in m and ("rate" in m or "stage" in m):
        return {"agent":"nova","text":"Conversion rates (últimos 30 días, n=47): new→contacted 60%, contacted→qualified 45%, qualified→proposal 38%, proposal→negotiation 60%, negotiation→won 50%.",
                "canvas":{"type":"display","agent":"nova","blocks":[_bar_chart("Conversion %", [{"x":"new→cont","y":60},{"x":"cont→qual","y":45},{"x":"qual→prop","y":38},{"x":"prop→neg","y":60},{"x":"neg→won","y":50}])]}}

    if "probabilidad" in m or "ajustar" in m:
        return {"agent":"nova","text":"Tuneá las probabilidades por etapa abajo y guardo.",
                "canvas":{"type":"interactive","agent":"nova","controls":[
                    {"kind":"slider","label":"new","min":0,"max":1,"step":0.01,"value":0.05,"id":"p_new"},
                    {"kind":"slider","label":"contacted","min":0,"max":1,"step":0.01,"value":0.10,"id":"p_contacted"},
                    {"kind":"slider","label":"qualified","min":0,"max":1,"step":0.01,"value":0.25,"id":"p_qualified"},
                    {"kind":"slider","label":"proposal","min":0,"max":1,"step":0.01,"value":0.50,"id":"p_proposal"},
                    {"kind":"slider","label":"negotiation","min":0,"max":1,"step":0.01,"value":0.75,"id":"p_negotiation"}
                ],"submit":{"label":"Recalcular forecast"}}}

    return {"agent":"nova","text":"Decime qué métrica querés ver (ventana?).","canvas":None}
