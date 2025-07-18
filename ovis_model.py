from transformers import AutoModelForCausalLM, AutoTokenizer, AutoProcessor
from huggingface_hub import snapshot_download

# 模型名稱
model_name = "AIDC-AI/Ovis2-4B"
# 本地儲存路徑
local_dir = "./models/Ovis2-4B"

# 下載整個模型 snapshot（包含所有權重與 config）
snapshot_download(repo_id=model_name, local_dir=local_dir, local_dir_use_symlinks=False)

# 確保 tokenizer/processor 也存好（這段可選，若上面有就不用）
#AutoTokenizer.from_pretrained(local_dir, trust_remote_code=True)
#AutoProcessor.from_pretrained(local_dir)
#AutoModelForCausalLM.from_pretrained(local_dir, trust_remote_code=True)
