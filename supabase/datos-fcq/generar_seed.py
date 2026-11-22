#!/usr/bin/env python3
"""Genera supabase/seed_fcq.sql a partir de los JSON de supabase/datos-fcq/.

Uso:  python3 supabase/datos-fcq/generar_seed.py

Cada JSON es un plan de estudios leído de las resoluciones oficiales de la
FCQ-UNA. Los ids son UUID v5 derivados de nombres (carrera, plan, materia),
así el seed se puede volver a ejecutar sin duplicar nada (on conflict).
"""
import json
import re
import pathlib
import uuid

AQUI = pathlib.Path(__file__).resolve().parent
SALIDA = AQUI.parent / "seed_fcq.sql"
NS = uuid.UUID("6f1c2a4e-6c3b-4d0e-9f8a-0c0e0a0f0c51")  # espacio de nombres fijo del CEQ

CARRERAS = {
    # sigla: (nombre oficial, semestres del plan 2026)
    "F": ("Farmacia", 11),
    "B": ("Bioquímica", 11),
    "IQ": ("Ingeniería Química", 11),
    "QI": ("Química Industrial", 9),
    "CTA": ("Ciencia y Tecnología de Alimentos", 9),
    "N": ("Nutrición", 10),
    "IA": ("Ingeniería de Alimentos", 11),
}

# Reglamento de Régimen Académico, Res. CSU 0108-00-2024, Art. 43, 44, 46, 57, 58.
REGLA_GENERAL = dict(
    minimo_teoria=50,
    minimo_laboratorio=60,
    minimo_asistencia=60,
    minimo_asistencia_lab=100,
    modo_laboratorio="separado",
    notas=(
        "Res. CSU 0108-00-2024 (Art. 43): parciales teóricos >= 50 % (o >= 60 % en recuperación), "
        "parciales prácticos >= 60 %, asistencia a teoría >= 60 % y 100 % de las prácticas aprobadas. "
        "PG = (teoría + práctica) / 2 (Art. 44). CF = 0,40 PG + 0,60 EF, con EF >= 60 % (Art. 57)."
    ),
)


def uid(*partes):
    return str(uuid.uuid5(NS, "|".join(partes)))


def num(valor):
    return "null" if valor is None else str(valor)


def q(texto):
    if texto is None:
        return "null"
    return "'" + str(texto).replace("'", "''") + "'"


def main():
    planes = sorted(p for p in AQUI.glob("*-20*.json") if not p.name.startswith(("calendario", "homologacion")))
    out = [
        "-- =============================================================",
        "-- Catálogo académico de la FCQ-UNA (carreras, planes, materias,",
        "-- prerrequisitos, optativas y regla general de firma).",
        "-- GENERADO por supabase/datos-fcq/generar_seed.py: no editar a mano.",
        "-- Fuentes: resoluciones del CSU publicadas en https://www.qui.una.py",
        "-- (ver supabase/datos-fcq/README.md). Se puede ejecutar más de una vez.",
        "-- =============================================================",
        "begin;",
        "",
        "-- Carreras",
    ]
    for sigla, (nombre, sem) in CARRERAS.items():
        out.append(
            f"insert into public.carreras (id, nombre, sigla, semestres) values ({q(uid('carrera', sigla))}, {q(nombre)}, {q(sigla)}, {sem})"
            f" on conflict (id) do update set nombre = excluded.nombre, semestres = excluded.semestres;"
        )

    for ruta in planes:
        d = json.loads(ruta.read_text(encoding="utf-8"))
        sigla, plan = d["carrera"], d["plan"]
        cid, pid = uid("carrera", sigla), uid("plan", sigla, plan)
        vigente = d.get("vigente", True)
        out += ["", f"-- {CARRERAS[sigla][0]} · {plan} · {d['fuente']}"]
        out.append(
            f"insert into public.planes (id, carrera_id, nombre, anio, vigente) values ({q(pid)}, {q(cid)}, {q(plan)}, {d['anio']}, {str(vigente).lower()})"
            f" on conflict (id) do update set nombre = excluded.nombre, anio = excluded.anio, vigente = excluded.vigente;"
        )

        ids = {}
        filas = []
        orden = 0
        for m in d["materias"]:
            nivel, nombre, t, rp, p, cred, pre = m[:7]
            extra = m[7] if len(m) > 7 else None
            horas = (t + rp + p) * 15
            if extra:
                # "2 h semanales + 400 h semestrales" o "400 h semestrales"
                hallado = re.search(r"(\d+) h semestrales", extra)
                if hallado:
                    horas += int(hallado.group(1))
            orden += 1
            mid = uid("materia", sigla, plan, nombre)
            ids[nombre] = (mid, nivel, False)
            filas.append((mid, nombre, nivel, horas, cred, p > 0, None, orden))

        grupos = d.get("optativas", {}).get("grupos", [])
        grupo_por_materia = {}
        for g in grupos:
            gid = uid("grupo", sigla, plan, g["nombre"])
            out.append(
                f"insert into public.grupos_optativas (id, plan_id, nombre, cantidad_exigida) values ({q(gid)}, {q(pid)}, {q(g['nombre'])}, {g['cantidad_exigida']})"
                f" on conflict (id) do update set nombre = excluded.nombre, cantidad_exigida = excluded.cantidad_exigida;"
            )
            g["_id"] = gid
            for nombre in g.get("materias", []):
                grupo_por_materia[nombre] = g
        grupo_general = next((g for g in grupos if "materias" not in g), grupos[0] if grupos else None)

        for m in d.get("optativas", {}).get("materias", []):
            _sem, nombre, t, rp, p, cred, pre = m[:7]
            g = grupo_por_materia.get(nombre, grupo_general)
            # La optativa se ubica en el primer nivel donde el plan tiene un hueco de optativa.
            nivel = min(g["niveles"])
            orden += 1
            mid = uid("materia", sigla, plan, "optativa", nombre)
            ids.setdefault(nombre, (mid, nivel, True))
            if ids[nombre][0] != mid:
                # Mismo nombre que una obligatoria (ej. Inglés Técnico): se distingue.
                ids["optativa:" + nombre] = (mid, nivel, True)
            filas.append((mid, nombre, nivel, (t + rp + p) * 15, cred, p > 0, g["_id"], orden))

        for mid, nombre, nivel, horas, cred, lab, gid, ordn in filas:
            out.append(
                "insert into public.materias (id, plan_id, nombre, semestre, horas, creditos, tiene_laboratorio, grupo_optativa_id, orden) values "
                f"({q(mid)}, {q(pid)}, {q(nombre)}, {nivel}, {horas}, {num(cred)}, {str(lab).lower()}, {q(gid)}, {ordn})"
                " on conflict (id) do update set nombre = excluded.nombre, semestre = excluded.semestre, horas = excluded.horas,"
                " creditos = excluded.creditos, tiene_laboratorio = excluded.tiene_laboratorio, grupo_optativa_id = excluded.grupo_optativa_id, orden = excluded.orden;"
            )

        obligatorias = [(n, v) for n, v in ids.items() if not v[2] and not n.startswith("optativa:")]
        todas = list(d["materias"]) + [[None] + list(m[1:]) for m in d.get("optativas", {}).get("materias", [])]
        for m in todas:
            nombre, pre = m[1], m[6]
            es_opt = m[0] is None
            clave = ("optativa:" + nombre) if es_opt and ("optativa:" + nombre) in ids else nombre
            mid = ids[clave][0]
            requeridas = []
            for r in pre:
                if r.startswith("*nivel "):
                    tope = int(r.split()[1])
                    requeridas += [v[0] for n, v in obligatorias if v[1] <= tope]
                else:
                    if r not in ids:
                        raise SystemExit(f"{ruta.name}: prerrequisito desconocido '{r}' en '{nombre}'")
                    requeridas.append(ids[r][0])
            for rid in dict.fromkeys(requeridas):
                if rid == mid:
                    continue
                out.append(
                    f"insert into public.prerrequisitos (materia_id, requiere_id, tipo) values ({q(mid)}, {q(rid)}, 'aprobada') on conflict do nothing;"
                )

        r = REGLA_GENERAL
        out.append(
            "insert into public.reglas_firma (id, plan_id, minimo_teoria, minimo_laboratorio, minimo_asistencia, minimo_asistencia_lab, modo_laboratorio, notas) values "
            f"({q(uid('regla', sigla, plan))}, {q(pid)}, {r['minimo_teoria']}, {r['minimo_laboratorio']}, {r['minimo_asistencia']}, {r['minimo_asistencia_lab']}, {q(r['modo_laboratorio'])}, {q(r['notas'])})"
            " on conflict (id) do update set minimo_teoria = excluded.minimo_teoria, minimo_laboratorio = excluded.minimo_laboratorio,"
            " minimo_asistencia = excluded.minimo_asistencia, minimo_asistencia_lab = excluded.minimo_asistencia_lab, notas = excluded.notas;"
        )

    out += ["", "commit;", ""]
    SALIDA.write_text("\n".join(out), encoding="utf-8")
    print(f"{SALIDA.relative_to(AQUI.parent.parent)}: {len(planes)} planes, {len(out)} líneas")


if __name__ == "__main__":
    main()
