import requests
import time
# Importe a biblioteca do seu banco de dados aqui (ex: psycopg2 para PostgreSQL, mysql-connector para MySQL, sqlite3, etc.)

# Configurações do Banco de Dados (Substitua pelas suas credenciais)
DB_CONFIG = {
    'host': 'localhost',
    'user': 'seu_usuario',
    'password': 'sua_senha',
    'database': 'seu_banco'
}

def conectar_banco():
    """
    Função para conectar ao seu banco de dados.
    Adapte de acordo com o banco que você está usando (MySQL, Postgres, etc.)
    """
    print("Conectando ao banco de dados...")
    # Exemplo genérico:
    # conexao = biblioteca.connect(**DB_CONFIG)
    # return conexao
    pass

def salvar_no_banco(dados_empresa):
    """
    Função para inserir o lead no banco de dados.
    """
    # conexao = conectar_banco()
    # cursor = conexao.cursor()
    # query = "INSERT INTO leads (cnpj, razao_social, telefone, email, cnae) VALUES (%s, %s, %s, %s, %s)"
    # valores = (dados_empresa['cnpj'], dados_empresa['razao_social'], dados_empresa['telefone'], dados_empresa['email'], dados_empresa['cnae'])
    # cursor.execute(query, valores)
    # conexao.commit()
    # conexao.close()
    print(f"✅ Salvo no banco: {dados_empresa['razao_social']} - {dados_empresa['email']} / {dados_empresa['telefone']}")

def buscar_empresas_por_cnae(cnae_codigo, limite=50):
    """
    Busca empresas usando uma API pública (exemplo usando a API do Minha Receita ou similar).
    Como você não tem nicho específico, usaremos CNAEs genéricos de comércio e serviços.
    """
    # A API do Minha Receita permite buscar por CNAE
    url = f"https://minhareceita.org/list/cnae/{cnae_codigo}"
    
    try:
        response = requests.get(url, timeout=10)
        if response.status_code == 200:
            cnpjs = response.json()
            print(f"Encontrados {len(cnpjs)} CNPJs para o CNAE {cnae_codigo}")
            
            for cnpj in cnpjs[:limite]:
                buscar_detalhes_cnpj(cnpj)
                time.sleep(1) # Pausa para não sobrecarregar a API
        else:
            print(f"Erro ao buscar CNAE: Status {response.status_code}")
    except Exception as e:
        print(f"Erro na requisição: {e}")

def buscar_detalhes_cnpj(cnpj):
    """
    Busca os detalhes (email, telefone, nome) de um CNPJ específico usando a BrasilAPI.
    """
    url = f"https://brasilapi.com.br/api/cnpj/v1/{cnpj}"
    
    try:
        response = requests.get(url, timeout=10)
        if response.status_code == 200:
            dados = response.json()
            
            # Filtra apenas se tiver email ou telefone
            email = dados.get('email', '')
            telefone = dados.get('ddd_telefone_1', '')
            
            if email or telefone:
                lead = {
                    'cnpj': dados.get('cnpj'),
                    'razao_social': dados.get('razao_social'),
                    'telefone': telefone,
                    'email': email,
                    'cnae': dados.get('cnae_fiscal_descricao')
                }
                salvar_no_banco(lead)
            else:
                print(f"❌ CNPJ {cnpj} ignorado (sem e-mail/telefone).")
        else:
            print(f"Erro ao buscar detalhes do CNPJ {cnpj}")
    except Exception as e:
        print(f"Erro na requisição do CNPJ {cnpj}: {e}")

if __name__ == "__main__":
    print("Iniciando o scraper do Passo 1 (Dados Abertos de CNPJ)...")
    
    # Como não há nicho, vamos buscar alguns CNAEs gerais e amplos (Comércio Varejista, Serviços de Escritório, etc.)
    # Exemplo: 4712100 (Minimercados), 4781400 (Vestuário)
    cnaes_alvo = ['4712100', '4781400'] 
    
    for cnae in cnaes_alvo:
        print(f"\\n--- Buscando CNAE: {cnae} ---")
        buscar_empresas_por_cnae(cnae, limite=20) # Começando com um limite pequeno para teste
        
    print("\\nProcesso finalizado!")
