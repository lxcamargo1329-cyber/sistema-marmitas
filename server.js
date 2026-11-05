const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Configuração do Supabase
const SUPABASE_URL = 'https://ralqwrxkxdscuvzgawew.supabase.co';
const SUPABASE_KEY = 'sb_publishable_afWq-TrdTZYeo4jEIQUjdw_tV8FzXDN';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Rota para cadastrar compras
app.post('/api/compras', async (req, res) => {
  const { item, quantidadeTotal, valorTotal } = req.body;

  if (!item || !quantidadeTotal || !valorTotal) {
    return res.status(400).json({ erro: 'Preencha todos os campos da compra.' });
  }

  const { data, error } = await supabase
    .from('compras')
    .insert([
      {
        item: item.trim(),
        quantidade_total: parseFloat(quantidadeTotal),
        valor_total: parseFloat(valorTotal)
      }
    ]);

  if (error) {
    console.error("Erro ao salvar compra:", error);
    return res.status(500).json({ erro: 'Erro ao salvar compra no banco.' });
  }

  res.json({ sucesso: true, mensagem: 'Compra cadastrada com sucesso!' });
});

// Sua função original mantida exatamente como você enviou
async function recalcularPrecoMarmita(ingredientesUsados) {
  let custoTotalProducao = 0;
  const detalhamento = [];

  for (const uso of ingredientesUsados) {
    const nomeBusca = uso.item.toLowerCase().trim();

    // Busca a compra mais recente do ingrediente
    const { data, error } = await supabase
      .from('compras')
      .select('*')
      .ilike('item', `%${nomeBusca}%`)
      .order('data_compra', { ascending: false })
      .limit(1);

    if (error || !data || data.length === 0) {
      throw new Error(`O ingrediente "${uso.item}" não tem compras cadastradas no Supabase.`);
    }

    const compraItem = data[0];
    
    // Calcula o custo unitário (seja por peso/ml ou por unidade pura)
    const precoPorUnidadeMedida = compraItem.valor_total / compraItem.quantidade_total;
    const custoIngrediente = precoPorUnidadeMedida * parseFloat(uso.quantidadeUso);

    custoTotalProducao += custoIngrediente;

    detalhamento.push({
      item: uso.item,
      quantidadeUsada: uso.quantidadeUso,
      custoCalculado: parseFloat(custoIngrediente.toFixed(2)),
      baseadoNaCompraDe: compraItem.data_compra
    });
  }

  const margemLucro = 0.40; // Margem de 40%
  const valorVendaSugerido = custoTotalProducao * (1 + margemLucro);

  return {
    custoTotal: parseFloat(custoTotalProducao.toFixed(2)),
    precoVendaSugerido: parseFloat(valorVendaSugerido.toFixed(2)),
    detalhamento
  };
}

// Rota para calcular e salvar marmitas (ajustada para chave primária no id)
app.post('/api/marmitas/calcular', async (req, res) => {
  const { nomeMarmita, ingredientesUsados } = req.body; 

  if (!nomeMarmita || !ingredientesUsados || ingredientesUsados.length === 0) {
    return res.status(400).json({ erro: 'Informe o nome da marmita e adicione ingredientes.' });
  }

  try {
    const { custoTotal, precoVendaSugerido, detalhamento } = await recalcularPrecoMarmita(ingredientesUsados);
    const nomeLimpo = nomeMarmita.trim();

    // Verifica se já existe uma marmita com esse nome para atualizar via id
    const { data: marmitaExistente, error: erroBusca } = await supabase
      .from('marmitas')
      .select('id')
      .ilike('nome', nomeLimpo)
      .limit(1);

    if (erroBusca) {
      console.error("Erro ao buscar marmita existente:", erroBusca);
      return res.status(500).json({ erro: 'Erro ao verificar marmita no banco.' });
    }

    let errorSupabase;

    if (marmitaExistente && marmitaExistente.length > 0) {
      const idExistente = marmitaExistente[0].id;
      const { error } = await supabase
        .from('marmitas')
        .update({
          ingredientes: ingredientesUsados,
          custo_total: custoTotal,
          preco_venda: precoVendaSugerido,
          atualizado_em: new Date().toISOString()
        })
        .eq('id', idExistente);
      
      errorSupabase = error;
    } else {
      const { error } = await supabase
        .from('marmitas')
        .insert([
          {
            nome: nomeLimpo,
            ingredientes: ingredientesUsados,
            custo_total: custoTotal,
            preco_venda: precoVendaSugerido,
            atualizado_em: new Date().toISOString()
          }
        ]);

      errorSupabase = error;
    }

    if (errorSupabase) {
      console.error("Erro ao salvar no Supabase:", errorSupabase);
      return res.status(500).json({ erro: 'Erro ao salvar marmita no banco: ' + errorSupabase.message });
    }

    res.json({
      sucesso: true,
      nomeMarmita: nomeLimpo,
      custoTotal: custoTotal.toFixed(2),
      precoVendaSugerido: precoVendaSugerido.toFixed(2),
      detalhamentoIngredientes: detalhamento
    });
  } catch (err) {
    return res.status(400).json({ erro: err.message });
  }
});

// Rota para buscar todas as marmitas cadastradas
app.get('/api/marmitas', async (req, res) => {
  const { data, error } = await supabase
    .from('marmitas')
    .select('*')
    .order('nome', { ascending: true });

  if (error) {
    console.error("Erro ao buscar marmitas:", error);
    return res.status(500).json({ erro: 'Erro ao buscar marmitas.' });
  }

  res.json(data);
});

app.listen(PORT, () => {
  console.log(`Servidor rodando em: http://localhost:${PORT}`);
});