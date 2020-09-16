from wordcloud import WordCloud
import matplotlib.pyplot as plt


def generate_wordcloud(text):
    wordcloud = WordCloud(width=800, height=800,
                          background_color='white',
                          colormap='viridis', collocations=False,
                          min_font_size=10).generate(text)
    plt.figure(figsize=(8, 8), facecolor=None)
    plt.imshow(wordcloud)
    plt.axis("off")
    plt.tight_layout(pad=0)

    plt.show()
    return plt
