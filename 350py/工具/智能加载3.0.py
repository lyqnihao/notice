# -*- coding: utf-8 -*-
import os
import json

# ================= 核心配置区 =================
# 1. 存放 .py 脚本的目录
PY_DIR = "/storage/emulated/0/bh/py"

# 2. 存放 XBPQ .json 规则的目录
JSON_DIR = "/storage/emulated/0/bh/json"

# 3. XBPQ 插件的 JAR 包路径 (相对于 config.json 的路径)
XBPQ_JAR_PATH = "./jar/xbpq.jar"

# 4. 最终生成的 config.json 输出路径
OUTPUT_CONFIG_PATH = "/storage/emulated/0/bh/config.json"
# =============================================

def scan_py_scripts(py_dir):
    """扫描目录下的 .py 文件，生成 Python 站点配置"""
    sites = []
    if not os.path.isdir(py_dir):
        print(f"⚠️ 警告: .py 目录不存在 -> {py_dir}")
        return sites

    for f in sorted(os.listdir(py_dir)):
        # 只处理 .py 文件，排除自身和配置文件
        if not f.endswith(".py") or f in ["script_runner.py", "config.json", "auto_config.py"]:
            continue
            
        name_part = f[:-3]  # 去掉 .py 后缀
        full_path = os.path.join(py_dir, f)
        
        sites.append({
            "key": f"py_{name_part}",
            "name": name_part,
            "type": 3,
            "searchable": 1,
            "quickSearch": 1,
            "api": f"file://{full_path}"
        })
    return sites

def scan_xbpq_json(json_dir, jar_path):
    """扫描目录下的 .json 文件，生成 XBPQ 站点配置"""
    sites = []
    if not os.path.isdir(json_dir):
        print(f"⚠️ 警告: .json 目录不存在 -> {json_dir}")
        return sites

    for f in sorted(os.listdir(json_dir)):
        if not f.endswith(".json"):
            continue
            
        site_name = f[:-5]  # 去掉 .json 后缀
        # 如果需要自动加上特殊符号，可以取消下面这行的注释：
        # site_name = f"✨{site_name}✨"
        
        sites.append({
            "key": site_name,
            "name": site_name,
            "type": 3,
            "playerType": 2,
            "api": "csp_XBPQ",
            "jar": jar_path,
            "searchable": 1,
            "quickSearch": 1,
            "filterable": 1,
            "ext": f"./json/{f}"
        })
    return sites

def save_config(py_sites, json_sites, output_path):
    """合并两种配置并保存为 JSON 文件"""
    # 将 Python 站点和 JSON 站点合并
    all_sites = py_sites + json_sites
    
    config = {
        # 👇 这里已经为你加上了指定的 spider 路径
        "spider": "./jar/xyq.jar",
        "sites": all_sites
    }
    
    try:
        with open(output_path, "w", encoding="utf-8") as f:
            json.dump(config, f, ensure_ascii=False, indent=2)
            
        print("="*40)
        print(f"✅ 生成完毕！")
        print(f"📊 共扫描到 {len(py_sites)} 个 .py 脚本")
        print(f"📊 共扫描到 {len(json_sites)} 个 .json 规则")
        print(f"📄 配置文件已保存至: {output_path}")
        print("="*40)
    except Exception as e:
        print(f"❌ 保存失败，错误信息: {e}")

# ================= 主程序入口 =================
if __name__ == "__main__":
    print("🚀 开始自动扫描并生成配置...")
    
    py_list = scan_py_scripts(PY_DIR)
    json_list = scan_xbpq_json(JSON_DIR, XBPQ_JAR_PATH)
    
    save_config(py_list, json_list, OUTPUT_CONFIG_PATH)
