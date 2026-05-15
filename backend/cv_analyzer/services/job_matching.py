import re
from sentence_transformers import SentenceTransformer, util
import torch
from bs4 import BeautifulSoup

# Khởi tạo mô hình SentenceTransformer
model = SentenceTransformer('distiluse-base-multilingual-cased-v1')

def strip_html(html_text):
    """Loại bỏ các thẻ HTML khỏi chuỗi văn bản."""
    return BeautifulSoup(html_text or "", "html.parser").get_text(separator=" ")

def split_sentences(text):
    """Tách văn bản thành các câu."""
    sentences = re.split(r'(?<=[.!?])\s+', text)
    return [s.strip() for s in sentences if len(s.strip()) > 0]

def match_cv_with_jobs(cv_text, job_positions, top_n=5):
    """
    So khớp CV với danh sách công việc và trả về top N công việc phù hợp nhất.
    """
    cv_sentences = [s for s in cv_text.split('\n') if s.strip()]
    if not cv_sentences:
        return []
    # Tách câu trong CV và chuyển thành embedding
    cv_embeddings = model.encode(cv_sentences, convert_to_tensor=True)

    results = []

    for job in job_positions:
        job_id = job['id']
        # Gộp và làm sạch HTML cho mô tả công việc
        job_text = strip_html(job.get('description', ''))

        # Chuyển mô tả công việc thành embedding
        job_sentences = split_sentences(job_text)
        if not job_sentences:
            continue
        job_embeddings = model.encode(job_sentences, convert_to_tensor=True)

        # Tính độ tương đồng cosine giữa CV và công việc
        similarity_matrix = util.cos_sim(cv_embeddings, job_embeddings)
        avg_similarity = torch.mean(similarity_matrix).item()

        # Thêm kết quả vào danh sách
        results.append({
            'id': job_id,
            'similarity_score': round(avg_similarity, 5)
        })

    # Sắp xếp kết quả theo điểm tương đồng (giảm dần)
    results = sorted(results, key=lambda x: x['similarity_score'], reverse=True)

    # Trả về top N công việc phù hợp
    return results[:top_n]
