#!/usr/bin/env python3
"""FamiPet - system architecture diagram (left-to-right, light theme).

Grounded in the root docker-compose.yml (the canonical stack):
nginx, frontend, backend, ai, mongodb, cloudflared.
External integrations (OpenAI-compatible PetGPT provider, Cloudinary,
SMTP) are configured through the backend environment and are NOT
Compose services.

Render:
    python3 system_architecture.py
Writes ../png/system_architecture.png and ../svg/system_architecture.svg.
For a variant without Cloudflare (users go straight to nginx):
    FAMIPET_DIAGRAM_NO_CLOUDFLARE=1 python3 system_architecture.py
Writes ../png/system_architecture_no_cloudflare.png and .svg instead.
Requires: graphviz (`dot`) and the pip package `diagrams`.
"""

import os
import shutil

from diagrams import Cluster, Diagram, Node, Edge

HERE = os.path.dirname(os.path.abspath(__file__))
NO_CF = os.environ.get("FAMIPET_DIAGRAM_NO_CLOUDFLARE") == "1"
SUFFIX = "_no_cloudflare" if NO_CF else ""
OUT_PNG = os.path.join(HERE, "..", "png", "system_architecture" + SUFFIX)

# --- palette ---------------------------------------------------------------
INK = "#0F172A"
SUB = "#475569"
WHITE = "#FFFFFF"
C_EDGE = "#2563EB"   # public / internet edge
C_WEB = "#0E7490"    # gateway + frontend
C_API = "#4338CA"    # application backend
C_DATA = "#047857"   # database
C_AI = "#6D28D9"     # in-stack ML service
C_EXT = "#B45309"    # external integrations

CL_EDGE = "#EFF6FF"  # public edge cluster tint
CL_DOCK = "#F1F5F9"  # docker compose cluster tint
CL_EXT = "#FFF7ED"   # external services cluster tint

FRONT_GUARD = "behind nginx and a Cloudflare Tunnel"
if NO_CF:
    FRONT_GUARD = "behind nginx"

graph_attr = {
    "bgcolor": WHITE,
    "label": (
        "<<TABLE BORDER=\"0\" CELLBORDER=\"0\" CELLSPACING=\"0\">"
        "<TR><TD><FONT POINT-SIZE=\"30\"><B>FamiPet \u2014 System Architecture</B></FONT></TD></TR>"
        "<TR><TD><FONT POINT-SIZE=\"15\" COLOR=\"#475569\">React SPA + Express API + MongoDB "
        f"+ breed AI (MobileNetV2) + PetGPT, {FRONT_GUARD}</FONT></TD></TR>"
        "</TABLE>>"
    ),
    "labelloc": "t",
    "fontname": "Helvetica",
    "fontsize": "30",
    "fontcolor": INK,
    "splines": "spline",
    "rankdir": "LR",
    "nodesep": "0.50",
    "ranksep": "0.95",
    "pad": "0.4",
    "dpi": "144",
}

node_attr = {
    "fontname": "Helvetica",
    "fontsize": "12",
    "fontcolor": INK,
    "shape": "box",
    "style": "rounded,filled",
    "fillcolor": WHITE,
    "penwidth": "2",
    "margin": "0.10,0.06",
    # the diagrams package defaults fixedsize/imagescale on; both make the
    # HTML card label overflow its box, so size cards to their content.
    "fixedsize": "false",
    "imagescale": "false",
}

edge_attr = {
    "fontname": "Helvetica",
    "fontsize": "11",
    "fontcolor": SUB,
    "penwidth": "1.7",
    "arrowsize": "0.8",
}


def _icon_path(cls):
    """Absolute path of a diagrams provider icon (no node instance needed)."""
    base = os.path.dirname(os.path.abspath(__import__("diagrams").__file__))
    return os.path.normpath(os.path.join(base, "..", cls._icon_dir, cls._icon))


# provider icons are 256px (100-256px in practice); at dpi=144 graphviz draws
# them at natural_px/2 points and ignores IMG WIDTH/HEIGHT, so the icon cell
# gets a fixed height to keep every card the same height.
ICON_CELL = 140


def card(icon_cls, title, sub, accent):
    """White card with provider icon, title and sub-title, coloured border."""
    rows = []
    if icon_cls is not None:
        rows.append(
            f'<TR><TD HEIGHT="{ICON_CELL}" VALIGN="MIDDLE">'
            f'<IMG SRC="{_icon_path(icon_cls)}"/></TD></TR>'
        )
    rows.append(
        f'<TR><TD><FONT POINT-SIZE="14" COLOR="{INK}"><B>{title}</B></FONT></TD></TR>'
    )
    rows.append(
        f'<TR><TD><FONT POINT-SIZE="11" COLOR="{SUB}">{sub}</FONT></TD></TR>'
    )
    label = (
        "<" '<TABLE BORDER="0" CELLBORDER="0" CELLSPACING="0" CELLPADDING="7">'
        + "".join(rows)
        + "</TABLE>" + ">"
    )
    return Node(label, color=accent, penwidth="2.4")


def cluster(label, tint, accent, dashed=False):
    style = "rounded,filled" + (",dashed" if dashed else "")
    return Cluster(
        label,
        graph_attr={
            "fillcolor": tint,
            "style": style,
            "color": accent,
            "pencolor": accent,
            "penwidth": "2",
            "fontname": "Helvetica-Bold",
            "fontsize": "15",
            "fontcolor": accent,
            "labeljust": "l",
            "margin": "18",
        },
    )


with Diagram(
    "FamiPet System Architecture",
    filename=OUT_PNG,
    outformat=["png", "svg"],
    show=False,
    direction="LR",
    graph_attr=graph_attr,
    node_attr=node_attr,
    edge_attr=edge_attr,
):
    from diagrams.onprem.client import Users
    from diagrams.saas.cdn import Cloudflare
    from diagrams.generic.network import VPN
    from diagrams.onprem.network import Nginx
    from diagrams.programming.framework import React, FastAPI
    from diagrams.programming.language import Nodejs
    from diagrams.onprem.database import MongoDB
    from diagrams.saas.media import Cloudinary
    from diagrams.azure.aimachinelearning import AzureOpenai
    from diagrams.oci.monitoring import Email

    users = card(Users, "End Users", "web + mobile browsers", C_EDGE)

    if not NO_CF:
        with cluster("Public edge", CL_EDGE, C_EDGE):
            cf = card(Cloudflare, "Cloudflare", "public HTTPS edge", C_EDGE)
            tun = card(VPN, "Cloudflare Tunnel", "cloudflared \u00b7 outbound only", C_EDGE)

    with cluster("Docker Compose \u00b7 famipet", CL_DOCK, "#334155"):
        ngx = card(Nginx, "nginx", "reverse proxy \u00b7 only public port :8080", C_WEB)
        fe = card(React, "React Frontend", "React + Vite SPA \u00b7 :5502", C_WEB)
        be = card(Nodejs, "Express Backend", "Node.js + Express API \u00b7 :5000", C_API)
        db = card(MongoDB, "MongoDB", "mongo:7 \u00b7 petDB \u00b7 :27017", C_DATA)
        ai = card(FastAPI, "AI Breed Classifier", "FastAPI + MobileNetV2 \u00b7 :8000", C_AI)

    with cluster("External services", CL_EXT, C_EXT, dashed=True):
        llm = card(AzureOpenai, "OpenAI", "PetGPT provider \u00b7 PETGPT_OPENAI_*", C_EXT)
        cld = card(Cloudinary, "Cloudinary", "image storage", C_EXT)
        mail = card(Email, "SMTP / e-mail", "verify + reset mails", C_EXT)

    def ext_edge(label):
        return Edge(
            label=label, style="dashed", color=C_EXT,
            fontcolor=C_EXT, penwidth="1.6",
        )

    if NO_CF:
        users >> Edge(label="HTTPS", color=C_EDGE, fontcolor=C_EDGE) >> ngx
    else:
        users >> Edge(label="HTTPS", color=C_EDGE, fontcolor=C_EDGE) >> cf
        cf >> Edge(label="tunnel", color=C_EDGE, fontcolor=C_EDGE) >> tun
        tun >> Edge(label="HTTP", color=C_EDGE, fontcolor=C_EDGE) >> ngx

    ngx >> Edge(label="/*  SPA", color=C_WEB, fontcolor=C_WEB) >> fe
    ngx >> Edge(label="/api/*, /uploads/*", color=C_WEB, fontcolor=C_WEB) >> be

    be >> Edge(label="MONGODB_URI", color=C_DATA, fontcolor=C_DATA) >> db
    be >> Edge(label="PET_BREED_AI_URL", color=C_AI, fontcolor=C_AI) >> ai
    be >> ext_edge("PETGPT_OPENAI_*") >> llm
    be >> ext_edge("uploads") >> cld
    be >> ext_edge("auth e-mails") >> mail

    # layout anchors (invisible): keep the data/AI column left of the external
    # services column, align the two cluster boxes, and leave the express
    # backend's row clear through the data column so no edges cross.
    db >> Edge(style="invis") >> llm
    db >> Edge(style="invis") >> mail
    llm >> Edge(style="invis") >> cld
    mail >> Edge(style="invis") >> cld
    fe >> Edge(style="invis", weight="100") >> ai
    ai >> Edge(style="invis", weight="100") >> mail

# keep the svg beside the png/
shutil.move(OUT_PNG + ".svg", os.path.join(HERE, "..", "svg", "system_architecture" + SUFFIX + ".svg"))
